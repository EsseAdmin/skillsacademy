// Unit + database checks for the academy Page designer. Run (throwaway database):
//   DATABASE_URL=postgres://… npx tsx scripts/academy-page-test.ts
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  ACADEMY_SECTION_TYPES, DEFAULT_THEME, blankAcademySection, defaultAcademyPage, fillTokens, mergeAcademyWording, parseAcademyPage, safeVideoUrl,
  sanitizeAcademyPage, sanitizeAcademySection, academyImagesIn, type AcademyPage, type AcademySection,
} from "../lib/academyPage";
import { LIMITS } from "../lib/marketingPage";
import AcademyDesignedSite from "../components/AcademyDesignedSite";
import { Academies, AcademyPages, Courses, SiteBlocks, Templates } from "../lib/queries";
import { buildStartingPage, loadDesignerState, loadPublishedDesign, academyImageStorageKey } from "../lib/academyPageContent";
import { readFile, saveFile } from "../lib/storage";
import { ensureSeed } from "../lib/seed";
import { pool, queryOne } from "../lib/db";
import { proposeAcademyRewrite, drawAcademyImage } from "../lib/aiAcademyPage";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail ? " :: " + detail : ""}`);
}
const text = (html: string) => html.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
// A real 1x1 PNG, so the image sniffer accepts it.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

async function main() {
  const slug = "acme";

  // ---- sanitiser ----
  check("every section type has a blank starter that sanitises to itself", ACADEMY_SECTION_TYPES.every((t) => { const b = blankAcademySection(t, slug); return canon(sanitizeAcademySection(b, slug)) === canon(b); }));
  const hero = blankAcademySection("hero", slug);
  check("a blank hero joins this academy, not the platform", hero.type === "hero" && hero.primaryHref === "/a/acme/register" && !hero.showStats);
  check("a blank call-to-action joins this academy", (() => { const c = blankAcademySection("cta", slug); return c.type === "cta" && c.buttonHref === "/a/acme/register"; })());
  check("a damaged / empty / non-JSON value is not a page", parseAcademyPage("{nope", slug) === null && parseAcademyPage(null, slug) === null && parseAcademyPage('{"sections":"x"}', slug) === null);

  const hostile = sanitizeAcademyPage({
    theme: { primary: "red", secondary: "#123456", accent: "javascript:alert(1)", background: "#FFFFFF", headingFont: "Comic Sans", bodyFont: "serif" },
    header: { style: "weird", links: [{ label: "Bad", href: "javascript:alert(1)" }, { label: "Good", href: "#courses" }, { label: "Proto", href: "//evil.example" }, { label: "Ok", href: "https://example.org/x" }], registerLabel: "Join <b>us</b>" },
    footer: { links: [{ label: "x", href: "data:text/html,hi" }] },
    sections: [
      { type: "pricing", id: "p" },
      { type: "script", id: "s" },
      { type: "hero", id: "dup", headline: "Hi", primaryHref: "javascript:alert(1)", image: "../../etc/passwd", showStats: true, stats: [{ value: "1", label: "x" }], bg: "blue" },
      { type: "text", id: "dup", title: "Second", tone: "neon", bg: "#ABCDEF" },
      { type: "video", id: "v", url: "http://insecure.example/v.mp4", title: "V" },
      { type: "video", id: "v2", url: "javascript:alert(1)", title: "V2" },
      { type: "news", id: "n", date: "yesterday", image: "marketing/abc.png" },
      { type: "courses", id: "c", grouping: "bogus", columns: 9 },
      { type: "learn", id: "l", points: ["a", "", 5, "b"] },
      "nonsense",
    ],
  }, slug)!;
  check("a malformed colour falls back to the academy's branding", hostile.theme.primary === "" && hostile.theme.accent === "" && hostile.theme.secondary === "#123456" && hostile.theme.background === "#ffffff");
  check("fonts are limited to the list", hostile.theme.headingFont === "system" && hostile.theme.bodyFont === "serif");
  check("unsafe menu links are dropped, safe ones kept", hostile.header.links.length === 2 && hostile.header.links[0].href === "#courses" && hostile.header.links[1].href === "https://example.org/x" && hostile.footer.links.length === 0);
  check("unknown header style falls back", hostile.header.style === "brand");
  check("pricing, unknown types and junk are dropped", hostile.sections.map((s) => s.type).join(",") === "hero,text,video,video,news,courses,learn");
  const h = hostile.sections[0];
  check("hero: bad link, bad picture, stats and bad background are cleaned", h.type === "hero" && h.primaryHref === "/a/acme/register" && h.image === null && !h.showStats && h.stats.length === 0 && h.bg === "");
  check("duplicate ids are made unique", new Set(hostile.sections.map((s) => s.id)).size === hostile.sections.length);
  check("tone and section background are validated", (() => { const t = hostile.sections[1]; return t.type === "text" && t.tone === "light" && t.bg === "#abcdef"; })());
  check("video links must be https", (() => { const [a, b] = [hostile.sections[2], hostile.sections[3]]; return a.type === "video" && a.url === "" && b.type === "video" && b.url === ""; })() && safeVideoUrl("https://youtu.be/abc") === "https://youtu.be/abc" && safeVideoUrl("https://x") === "");
  check("news: a bad date and another academy's folder path are dropped", (() => { const n = hostile.sections[4]; return n.type === "news" && n.date === "" && n.image === null; })());
  check("courses and learn are clamped", (() => { const c = hostile.sections[5]; const l = hostile.sections[6]; return c.type === "courses" && c.grouping === "type" && c.columns === 3 && l.type === "learn" && l.points.join("|") === "a|b"; })());
  const many = sanitizeAcademyPage({ sections: Array.from({ length: 80 }, () => ({ type: "text", title: "x".repeat(900) })) }, slug)!;
  check("section count and lengths are limited", many.sections.length === LIMITS.sections && many.sections.every((s) => s.type === "text" && s.title.length <= LIMITS.title));
  check("{academy} and {year} are filled in", fillTokens("Welcome to {academy} © {year}", { name: "Acme", year: 2026 }) === "Welcome to Acme © 2026");

  // ---- starting page from the academy's existing content ----
  const start = defaultAcademyPage({
    slug, name: "Acme Academy", headline: "", tagline: "Learn well",
    blocks: [
      { type: "TEXT", title: "About", body: "Hello", videoUrl: null, imageKey: null, published: true, createdAt: "2026-01-02T00:00:00Z" },
      { type: "NEWS", title: "News!", body: "Big", videoUrl: null, imageKey: "abcdefgh1234.png", published: false, createdAt: "2026-02-03T10:00:00Z" },
      { type: "VIDEO", title: "Watch", body: "cap", videoUrl: "https://youtu.be/x", imageKey: null, published: true, createdAt: "2026-01-02T00:00:00Z" },
      { type: "VIDEO", title: "No link", body: "", videoUrl: null, imageKey: null, published: true, createdAt: "2026-01-02T00:00:00Z" },
      { type: "LEARN", title: "You'll learn", body: "", videoUrl: null, imageKey: null, published: true, createdAt: "2026-01-02T00:00:00Z", points: ["One", "Two"] },
    ],
  });
  check("starting page: hero uses the academy's name when there's no headline, then blocks in order, then courses and journeys",
    start.sections.map((s) => s.type).join(",") === "hero,text,news,video,learn,courses,journeys" && start.sections[0].type === "hero" && start.sections[0].headline === "Acme Academy" && start.sections[0].sub === "Learn well");
  check("starting page: hidden blocks stay hidden, news keeps its date", start.sections[2].visible === false && start.sections[2].type === "news" && start.sections[2].date === "2026-02-03" && start.sections[1].visible);
  check("starting page survives the sanitiser", canon(sanitizeAcademyPage(JSON.parse(JSON.stringify(start)), slug)) === canon(start));
  check("a page lists its picture keys", academyImagesIn(start).join() === "abcdefgh1234.png");

  // ---- wording-only AI merges ----
  const news: AcademySection = { ...(blankAcademySection("news", slug) as AcademySection & { type: "news" }), image: "abcdefgh1234.png", bg: "#112233", visible: false, anchor: "latest", date: "2026-03-04" };
  const merged = mergeAcademyWording(news, { type: "cta", id: "evil", title: "New headline", body: "New body", image: "zzzzzzzzzz.svg", bg: "#ffffff", visible: true, anchor: "x", date: "1999-01-01", url: "https://x.example" }, slug);
  check("an AI rewrite changes wording only", merged.type === "news" && merged.title === "New headline" && merged.body === "New body" && merged.image === "abcdefgh1234.png" && merged.bg === "#112233" && !merged.visible && merged.anchor === "latest" && merged.date === "2026-03-04" && merged.id === news.id);
  const heroMerge = mergeAcademyWording(hero, { headline: "Hello *world*", primaryHref: "/evil", image: "aaaaaaaaaa.png" }, slug);
  check("a hero rewrite never touches its links or picture", heroMerge.type === "hero" && heroMerge.headline === "Hello *world*" && heroMerge.primaryHref === "/a/acme/register" && heroMerge.image === null);
  let err = "";
  await proposeAcademyRewrite(news, "hi", { slug, academyName: "Acme", language: "en" }, { rewriter: async () => ({}) }).catch((e) => (err = e.message));
  check("a too-short request is refused", /Say what you'd like changed/.test(err));
  err = "";
  await proposeAcademyRewrite(news, "make it shorter please", { slug, academyName: "Acme", language: "en" }, { rewriter: async () => 42 }).catch((e) => (err = e.message));
  check("a useless AI answer is refused", err.length > 0);
  let seen = "";
  const prop = await proposeAcademyRewrite(news, "make it friendlier", { slug, academyName: "Acme Academy", language: "fr" }, { rewriter: async (s, ask, o) => { seen = `${o.academyName}|${o.language}|${ask}`; return { ...s, title: "Friendlier" }; } });
  check("the rewriter is told the academy and language", seen === "Acme Academy|fr|make it friendlier" && prop.type === "news" && prop.title === "Friendlier");
  const svg = await drawAcademyImage({ subject: "a trainer showing a laptop to colleagues", academyName: "Acme", primary: "#112233", secondary: "#223344", accent: "#fbcb07" }, { drawer: async (req) => (req.kind === "page" && req.orgName === "Acme" && /trainer/.test(req.description) ? '<svg viewBox="0 0 800 450"><rect width="800" height="450" fill="#fff"/><circle cx="1" cy="1" r="9"/><rect x="1" y="1" width="9" height="9"/><script>x</script></svg>' : "") });
  check("a drawing is returned as clean SVG (script removed)", svg.startsWith("<svg") && !svg.includes("script"));

  // ---- database ----
  await ensureSeed();
  const bw = (await Academies.bySlug("brightwave"))!;
  const rv = (await Academies.bySlug("riverside"))!;
  const template = (await Templates.byId(bw.template_id))!;
  check("no design yet: the public page is still the original", (await loadPublishedDesign(bw)) === null);

  // The starting page copies the old pictures into the academy's own folder.
  await saveFile("site-blocks/test-news.png", PNG);
  await SiteBlocks.create({ academy_id: bw.id, block_type: "NEWS", title: "Grand opening", body_text: "We open", image_path: "site-blocks/test-news.png" });
  await SiteBlocks.create({ academy_id: bw.id, block_type: "LEARN", title: "What you'll learn", body_text: "- Alpha\n- Beta" });
  const state = await loadDesignerState(bw, "u1");
  const news1 = state.page.sections.find((s) => s.type === "news" && s.title === "Grand opening");
  check("first open builds a starting page and saves it as the draft", state.hasDraft && !state.isLive && (await AcademyPages.get(bw.id))?.draft_json != null);
  check("the news block's picture was copied into the academy's folder", !!news1 && news1.type === "news" && !!news1.image && (await readFile(academyImageStorageKey(bw.id, news1.image)))?.length === PNG.length);
  check("the picture is not reachable under another academy", !!news1 && news1.type === "news" && !!news1.image && (await readFile(academyImageStorageKey(rv.id, news1.image))) === null);
  check("the learn block's points came across", state.page.sections.some((s) => s.type === "learn" && s.points.join() === "Alpha,Beta"));
  const again = await loadDesignerState(bw, "u1");
  check("opening again doesn't rebuild the draft", canon(again.page) === canon(state.page));
  check("the first draft is not visible to visitors", (await loadPublishedDesign(bw)) === null);

  // Publish → history → per-academy isolation.
  const draft = structuredClone(state.page);
  draft.seo.title = "Brightwave design";
  await AcademyPages.saveDraft(bw.id, JSON.stringify(draft), "u1");
  for (let i = 1; i <= 23; i++) {
    await AcademyPages.publish(bw.id, JSON.stringify({ ...draft, seo: { ...draft.seo, title: `Version ${i}` } }), "u1");
    await new Promise((r) => setTimeout(r, 4));
  }
  await AcademyPages.publish(rv.id, JSON.stringify({ ...draft, seo: { ...draft.seo, title: "Riverside only" } }), "u2");
  const row = (await AcademyPages.get(bw.id))!;
  check("publishing sets the live copy and clears the draft", row.draft_json === null && (await loadPublishedDesign(bw))?.seo.title === "Version 23" && !!row.published_at);
  const versions = await AcademyPages.versions(bw.id);
  check("only the newest 20 versions are kept per academy, newest first", versions.length === 20 && parseAcademyPage(versions[0].content_json, "brightwave")?.seo.title === "Version 23" && parseAcademyPage(versions[19].content_json, "brightwave")?.seo.title === "Version 4");
  check("another academy's page and history are separate", (await loadPublishedDesign(rv))?.seo.title === "Riverside only" && (await AcademyPages.versions(rv.id)).length === 1);
  check("a version can only be read by its own academy", (await AcademyPages.version(bw.id, versions[2].id))?.id === versions[2].id && (await AcademyPages.version(rv.id, versions[2].id)) === undefined);
  await AcademyPages.saveDraft(bw.id, JSON.stringify(draft), "u1");
  const open = await loadDesignerState(bw, "u1");
  check("designer opens on the draft when there is one, and knows the design is live", open.hasDraft && open.isLive && open.page.seo.title === "Brightwave design");
  await AcademyPages.discardDraft(bw.id);
  const afterDiscard = await loadDesignerState(bw, "u1");
  check("discarding the draft leaves the live page alone", !afterDiscard.hasDraft && afterDiscard.page.seo.title === "Version 23");
  await AcademyPages.unpublish(bw.id);
  check("taking the design down shows the original page again, history kept", (await loadPublishedDesign(bw)) === null && (await AcademyPages.versions(bw.id)).length === 20);

  // ---- rendering ----
  const courses = await Courses.listByAcademy(bw.id, true);
  const page: AcademyPage = {
    ...start,
    theme: { primary: "#0a5c36", secondary: "#14803f", accent: "#ffcc00", background: "#fffdf5", headingFont: "serif", bodyFont: "humanist" },
    header: { style: "light", links: [{ label: "Our courses", href: "#courses" }], registerLabel: "Join", signInLabel: "" },
    footer: { style: "light", text: "© {year} {academy}", links: [{ label: "Privacy", href: "/a/brightwave/privacy" }] },
    sections: [
      { ...(blankAcademySection("text", "brightwave") as AcademySection & { type: "text" }), id: "t1", title: "Welcome *friends*", body: "First paragraph.\n\nSecond paragraph.", bg: "#123456" },
      { ...(blankAcademySection("hero", "brightwave") as AcademySection & { type: "hero" }), id: "h1", headline: "Hello {academy}", sub: "Tagline here", image: "abcdefgh1234.png", imageAlt: "A classroom", secondaryLabel: "See courses", secondaryHref: "#courses" },
      { ...(blankAcademySection("courses", "brightwave") as AcademySection & { type: "courses" }), id: "c1", anchor: "courses", title: "Everything we teach", grouping: "all" },
      { ...(blankAcademySection("video", "brightwave") as AcademySection & { type: "video" }), id: "v1", url: "https://www.youtube.com/watch?v=abc123", title: "Tour", caption: "A quick look" },
      { ...(blankAcademySection("learn", "brightwave") as AcademySection & { type: "learn" }), id: "l1", points: ["Be brilliant", "Stay curious"] },
      { ...(blankAcademySection("banner", "brightwave") as AcademySection & { type: "banner" }), id: "b1", title: "Hidden banner", visible: false },
      { ...(blankAcademySection("journeys", "brightwave") as AcademySection & { type: "journeys" }), id: "j1" },
    ],
  };
  const render = (p: AcademyPage) => renderToStaticMarkup(createElement(AcademyDesignedSite, { slug: "brightwave", academy: bw, template, page: p, courses, stats: {}, journeys: [] }));
  const html = render(page);
  const t = text(html);
  check("sections appear in the order set, hidden ones are left out", html.indexOf("Welcome") < html.indexOf("Hello Brightwave") && html.indexOf("Hello Brightwave") < html.indexOf("Everything we teach") && !t.includes("Hidden banner"));
  check("placeholders and *italic* markup are filled in", /Hello Brightwave/.test(t) && html.includes("<em>friends</em>") && /© \d{4} Brightwave/.test(t));
  check("paragraphs are split on blank lines", /First paragraph\./.test(t) && /Second paragraph\./.test(t));
  check("the hero picture is served from this academy's own route", html.includes('src="/api/academy-page-image/brightwave/abcdefgh1234.png"'));
  check("the theme colours, fonts and background are applied", html.includes("--brand-primary:#0a5c36") && html.includes("--brand-accent:#ffcc00") && html.includes("background:#fffdf5") && /Georgia/.test(html) && /Trebuchet/.test(html));
  check("a section background override is used", html.includes("background:#123456"));
  check("the menu has the custom link, the renamed account link, and the standard sign-in", html.includes('href="#courses"') && />Join</.test(html) && /Sign in|Log in/i.test(t));
  check("the course list shows the academy's published courses", courses.length > 0 && courses.every((c) => t.includes(c.title)));
  check("the video is embedded privately", html.includes("youtube-nocookie.com/embed/abc123"));
  check("the learn list is shown", /Be brilliant/.test(t) && /Stay curious/.test(t));
  check("the footer keeps the Powered-by line and shows custom links", /SkillsAcademy\.ai/.test(t) && html.includes('href="/a/brightwave/privacy"'));
  check("no script or javascript: link ever reaches the page", !/<script/i.test(html) && !/javascript:/i.test(html));
  const empty = render({ ...page, sections: [{ ...(page.sections[2] as AcademySection & { type: "courses" }), grouping: "type" }] });
  check("courses grouped by type use the course-type sections", /data-testid="type-section"/.test(empty));
  const plain = render({ ...page, theme: { ...DEFAULT_THEME }, header: { ...page.header, style: "brand" }, footer: { ...page.footer, style: "brand" } });
  check("with no theme set, the academy's Branding colours are used", plain.includes(`--brand-primary:${template.primary_color}`) && plain.includes(`--brand-accent:${template.accent_color}`));

  // ---- deleting an academy removes its design ----
  await Academies.softDelete(rv.id);
  await Academies.permanentlyDelete(rv.id);
  check("permanently deleting an academy removes its page and history", (await queryOne("SELECT 1 FROM academy_pages WHERE academy_id = $1", [rv.id])) === undefined && (await queryOne("SELECT 1 FROM academy_page_versions WHERE academy_id = $1", [rv.id])) === undefined);
  check("…and leaves other academies alone", (await AcademyPages.versions(bw.id)).length === 20);
  void buildStartingPage;

  await pool.end();
}
main().then(() => {
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed.");
  process.exit(failures ? 1 : 0);
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
