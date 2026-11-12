// Unit + database checks for the editable SkillsAcademy.ai home page. Run (throwaway database):
//   DATABASE_URL=postgres://… npx tsx scripts/marketing-page-test.ts
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  DEFAULT_HOME_PAGE, sanitizePage, sanitizeSection, parsePage, safeHref, applyTokens, buildTokenContext, mergeWording, blankSection, imagesIn,
  SECTION_TYPES, LIMITS, type HomePage, type Section, type SplitSection, type HeroSection,
} from "../lib/marketingPage";
import { MarketingSections, MarketingNav, MarketingFooter, themeStyle } from "../components/MarketingSections";
import { MarketingPages, SuperAdmins } from "../lib/queries";
import { ensureSeed } from "../lib/seed";
import { pool } from "../lib/db";
import { proposeRewrite, drawPageImage } from "../lib/aiMarketing";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail ? " :: " + detail : ""}`);
}
const text = (html: string) => html.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

const plans3 = [
  { id: "1", key: "starter", name: "Starter", price_pence: 2900, features_json: '["One"]', trial_days: 14 },
  { id: "2", key: "growth", name: "Growth", price_pence: 7900, features_json: '["Two"]', trial_days: 14 },
  { id: "3", key: "enterprise", name: "Enterprise", price_pence: 19900, features_json: "[]", trial_days: 14 },
];
const noTrial = plans3.map((p) => ({ ...p, trial_days: 0 }));

async function main() {
  // ---- the original design survives the sanitiser untouched ----
  const rt = sanitizePage(JSON.parse(JSON.stringify(DEFAULT_HOME_PAGE)));
  const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
  check("the original design passes the sanitiser unchanged", canon(rt) === canon(DEFAULT_HOME_PAGE));
  check("every section type has a blank starter that sanitises to itself", SECTION_TYPES.every((t) => { const b = blankSection(t); return canon(sanitizeSection(b)) === canon(b); }));
  check("a damaged / empty / non-JSON value falls back to the original", JSON.stringify(parsePage("{nope")) === JSON.stringify(DEFAULT_HOME_PAGE) && JSON.stringify(parsePage(null)) === JSON.stringify(DEFAULT_HOME_PAGE) && JSON.stringify(parsePage('{"sections":"x"}')) === JSON.stringify(DEFAULT_HOME_PAGE));

  // ---- tokens: the same wording the page had when it was hard-coded ----
  const ctx = buildTokenContext(plans3, 7, new Date("2026-05-05"));
  const ctx0 = buildTokenContext(noTrial, 0, new Date("2026-05-05"));
  const html = renderToStaticMarkup(createElement("div", null, createElement(MarketingSections, { page: DEFAULT_HOME_PAGE, plans: plans3, ctx })));
  const t = text(html);
  check("hero button names the trial", /Start Your 14-Day Free Trial/.test(t));
  check("hero stats are live numbers", /3 Subscription Plans/.test(t) && /14 Day Free Trial/.test(t) && /7\+ Academies Live/.test(t));
  check("heading line breaks and gold word", html.includes("<br/>") && html.includes("<em>Branded</em>") && /Launch Your Own<\/span><span><br\/>/.test(html));
  check("pricing intro says every plan includes the trial", /Every plan includes a 14-day free trial\. No credit card charge/.test(t));
  check("pillar 6 and step 3 and the call to action use the trial", /Simple Subscription — 14-day free trial, cancel anytime/.test(t) && /Select Starter, Growth or Enterprise — 14 days free\./.test(t) && /Start your 14-day free trial today\. No commitment, cancel any time\./.test(t));
  check("all three plans are priced", /£29\.00/.test(t) && /£79\.00/.test(t) && /£199\.00/.test(t) && /Most Popular/.test(t));
  const html0 = renderToStaticMarkup(createElement("div", null, createElement(MarketingSections, { page: DEFAULT_HOME_PAGE, plans: noTrial, ctx: ctx0 })));
  const t0 = text(html0);
  check("with no trial the wording changes accordingly", /Create Your Academy/.test(t0) && /Simple Monthly Plans/.test(t0) && /Choose the plan that fits your academy/.test(t0) && /Get started today\. No commitment/.test(t0) && /Simple Subscription — cancel anytime/.test(t0) && /Select Starter, Growth or Enterprise\./.test(t0) && !/Day Free Trial/.test(t0) && !/days free/.test(t0));
  check("mixed trials say Plans include", /Plans include a 7-day free trial/.test(text(renderToStaticMarkup(createElement(MarketingSections, { page: { ...DEFAULT_HOME_PAGE, sections: DEFAULT_HOME_PAGE.sections.filter((s) => s.type === "pricing") }, plans: [{ ...plans3[0], trial_days: 7 }, { ...plans3[1], trial_days: 0 }], ctx: buildTokenContext([{ name: "A", trial_days: 7 }, { name: "B", trial_days: 0 }], 1) })))));
  check("unknown tokens are left alone and a stray conditional can't loop", applyTokens("{nope} {{#trial}}x", ctx) === "{nope} {{#trial}}x");
  const nav = text(renderToStaticMarkup(createElement("div", null, createElement(MarketingNav, { page: DEFAULT_HOME_PAGE }), createElement(MarketingFooter, { page: DEFAULT_HOME_PAGE, ctx }))));
  check("nav and footer match the original", /SkillsAcademy\.ai/.test(nav) && /Platform Who It's For Pricing How It Works/.test(nav) && /© 2026 SkillsAcademy\.ai — Academy-as-a-Service for business, charity & public sector\./.test(nav) && /Create an Academy Academy Login$/.test(nav.trim()) && !/Platform Admin/.test(nav));
  check("the original colours add no inline style", themeStyle(DEFAULT_HOME_PAGE) === undefined);
  const themed = themeStyle({ ...DEFAULT_HOME_PAGE, theme: { navy: "#102a43", gold: "#ff8800" } }) as Record<string, string>;
  check("a custom theme sets colour variables", themed["--navy"] === "#102a43" && themed["--gold"] === "#ff8800" && !!themed["--gold-dim"] && !!themed["--navy-light"]);

  // ---- safety ----
  check("links: only safe forms survive", ["javascript:alert(1)", "data:text/html,x", "//evil.example", "/ok\\evil", " /a b", "http://insecure.example", "vbscript:x", "/x\ny"].every((h) => safeHref(h) === "") && ["/signup", "#pricing", "https://example.com/a?b=1", "mailto:hi@example.com", "/#how"].every((h) => safeHref(h) === h));
  const evil = sanitizePage({
    theme: { navy: "red;background:url(x)", gold: "#GGGGGG" },
    nav: { links: [{ label: "Bad", href: "javascript:alert(1)" }, { label: "Good", href: "/signup" }] },
    sections: [
      { type: "hero", headline: "<script>alert(1)</script>Hi", primaryHref: "javascript:x", image: "../../etc/passwd", showStats: true, stats: Array.from({ length: 20 }, (_, i) => ({ value: `${i}`, label: "x" })) },
      { type: "mystery", title: "x" },
      { type: "cards", items: Array.from({ length: 50 }, (_, i) => ({ title: `T${i}`, text: "x".repeat(2000) })), columns: 9, tone: "neon" },
      { type: "banner", image: "abcdefgh12.png", buttonHref: "javascript:1", buttonLabel: "Go" },
    ],
  }) as HomePage;
  const hero = evil.sections[0] as HeroSection;
  check("an unknown section type is dropped", evil.sections.length === 3);
  check("bad colours fall back to the defaults", evil.theme.navy === DEFAULT_HOME_PAGE.theme.navy && evil.theme.gold === DEFAULT_HOME_PAGE.theme.gold);
  check("bad nav links are dropped", evil.nav.links.length === 1 && evil.nav.links[0].href === "/signup");
  check("a bad button link falls back to /signup and a bad picture name is refused", hero.primaryHref === "/signup" && hero.image === null);
  check("lists, text length, columns and tone are clamped", hero.stats.length === LIMITS.stats && (evil.sections[1] as { items: unknown[] }).items.length === LIMITS.items && (evil.sections[1] as { items: { text: string }[] }).items[0].text.length <= LIMITS.text && (evil.sections[1] as { columns: number }).columns === 3 && (evil.sections[1] as { tone: string }).tone === "light");
  check("a banner keeps a valid picture but drops its unsafe link", (evil.sections[2] as { image: string }).image === "abcdefgh12.png" && (evil.sections[2] as { buttonHref: string }).buttonHref === "");
  const html2 = renderToStaticMarkup(createElement("div", null, createElement(MarketingSections, { page: evil, plans: plans3, ctx })));
  check("script text is shown as text, never as markup", !html2.includes("<script") && html2.includes("&lt;script&gt;"));
  check("duplicate section ids are made unique", new Set((sanitizePage({ sections: [{ type: "text", id: "a" }, { type: "text", id: "a" }] }) as HomePage).sections.map((s) => s.id)).size === 2);
  check("more than 30 sections are cut off", (sanitizePage({ sections: Array.from({ length: 80 }, () => ({ type: "text" })) }) as HomePage).sections.length === LIMITS.sections);

  // ---- pictures and layout in the markup ----
  const withPics: HomePage = {
    ...DEFAULT_HOME_PAGE,
    sections: [
      { ...(DEFAULT_HOME_PAGE.sections[0] as HeroSection), image: "heroimage01.png", imageAlt: "A trainer", showStats: true },
      { ...(DEFAULT_HOME_PAGE.sections[2] as SplitSection), image: "splitimage1.jpg", imageSide: "left", tone: "light" },
      { ...blankSection("banner"), image: "bannerimg01.svg", title: "Big *idea*", buttonLabel: "Go", buttonHref: "/signup" } as Section,
      { ...blankSection("text"), visible: false, title: "Hidden one" } as Section,
    ],
  };
  const h3 = renderToStaticMarkup(createElement("div", null, createElement(MarketingSections, { page: withPics, plans: plans3, ctx })));
  check("pictures render from the marketing-image route with alt text", h3.includes('src="/api/marketing-image/heroimage01.png"') && h3.includes('alt="A trainer"') && h3.includes("/api/marketing-image/splitimage1.jpg") && h3.includes("/api/marketing-image/bannerimg01.svg"));
  check("layout options reach the markup: picture left, tone, hero with picture", h3.includes("solution-inner flip") && h3.includes("solution tone-light") && h3.includes("hero has-image") && h3.includes('class="mk-banner medium"'));
  check("a hidden section is not rendered", !h3.includes("Hidden one"));
  check("imagesIn lists the pictures used", imagesIn(withPics).sort().join(",") === "bannerimg01.svg,heroimage01.png,splitimage1.jpg");

  // ---- AI wording changes only wording ----
  const split = DEFAULT_HOME_PAGE.sections[2] as SplitSection;
  const withImg: SplitSection = { ...split, image: "keepme12345.png", list: split.list.map((l) => ({ ...l })) };
  const rewriter = async () => ({ ...withImg, type: "split", id: "evil", visible: false, image: "other123456.png", imageSide: "left", tone: "light", title: "Fresh *title*", sub: "New sub", list: [{ title: "Only one", text: "point" }], anchor: "hijack" });
  const proposed = (await proposeRewrite(withImg, "make it punchier", { rewriter })) as SplitSection;
  check("a rewrite changes the wording", proposed.title === "Fresh *title*" && proposed.sub === "New sub" && proposed.list.length === 1);
  check("…but never the picture, id, visibility, layout, tone or anchor", proposed.image === "keepme12345.png" && proposed.id === withImg.id && proposed.visible === true && proposed.imageSide === "right" && proposed.tone === "dark" && proposed.anchor === "solution");
  const hero0 = DEFAULT_HOME_PAGE.sections[0] as HeroSection;
  const mh = mergeWording(hero0, { ...hero0, primaryHref: "https://evil.example", secondaryHref: "https://evil.example", headline: "New headline" }) as HeroSection;
  check("button links can't be changed by a rewrite", mh.primaryHref === hero0.primaryHref && mh.secondaryHref === hero0.secondaryHref && mh.headline === "New headline");
  let err = "";
  await proposeRewrite(withImg, "x", { rewriter }).catch((e) => (err = e.message));
  check("an empty request is refused", /Say what/.test(err));
  err = "";
  await proposeRewrite(withImg, "make it shorter please", { rewriter: async () => 42 }).catch((e) => (err = e.message));
  check("a useless AI answer is refused", err.length > 0);

  const svg = await drawPageImage({ subject: "a trainer showing a laptop to colleagues", navy: "#0b1f3b", gold: "#fbcb07" }, { drawer: async (req) => (req.kind === "marketing" && /trainer/.test(req.description) ? '<svg viewBox="0 0 800 450"><rect width="800" height="450" fill="#fff"/><circle cx="1" cy="1" r="9"/><rect x="1" y="1" width="9" height="9"/><script>x</script></svg>' : "") });
  check("a drawing is returned as clean SVG (script removed)", svg.startsWith("<svg") && !svg.includes("script"));
  err = "";
  await drawPageImage({ subject: "hi", navy: "#000000", gold: "#ffffff" }, { drawer: async () => "" }).catch((e) => (err = e.message));
  check("a too-short picture description is refused", /Describe the picture/.test(err));

  // ---- database: draft → publish → history ----
  await ensureSeed();
  const su = (await SuperAdmins.byEmail("superadmin@skillsacademy.ai"))!;
  check("nothing saved yet: no row", (await MarketingPages.get()) === undefined);
  await MarketingPages.saveDraft(JSON.stringify({ ...DEFAULT_HOME_PAGE, seo: { title: "Draft title", description: "" } }), su.id);
  let row = (await MarketingPages.get())!;
  check("a draft is stored without being published", !!row.draft_json && row.published_json === null);
  for (let i = 1; i <= 23; i++) {
    await MarketingPages.publish(JSON.stringify({ ...DEFAULT_HOME_PAGE, seo: { title: `Version ${i}`, description: "" } }), su.id);
    await new Promise((r) => setTimeout(r, 4));
  }
  row = (await MarketingPages.get())!;
  check("publishing sets the live copy and clears the draft", parsePage(row.published_json).seo.title === "Version 23" && row.draft_json === null && !!row.published_at);
  const versions = await MarketingPages.versions();
  check("only the newest 20 versions are kept, newest first", versions.length === 20 && parsePage(versions[0].content_json).seo.title === "Version 23" && parsePage(versions[19].content_json).seo.title === "Version 4");
  await MarketingPages.saveDraft(JSON.stringify(DEFAULT_HOME_PAGE), su.id);
  await MarketingPages.discardDraft();
  row = (await MarketingPages.get())!;
  check("discarding the draft leaves the live page alone", row.draft_json === null && parsePage(row.published_json).seo.title === "Version 23");
  check("a version can be looked up by id, only for its own page", (await MarketingPages.version(versions[3].id))?.id === versions[3].id && (await MarketingPages.version(versions[3].id, "other")) === undefined);

  await pool.end();
}
main().then(() => {
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed.");
  process.exit(failures ? 1 : 0);
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
