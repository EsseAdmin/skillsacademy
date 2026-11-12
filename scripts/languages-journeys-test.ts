// Tests for pass 34: academy languages (French, Spanish, German, English) and
// learning journeys (metro maps). Needs a throwaway Postgres database:
//   DATABASE_URL=postgres://… npx tsx scripts/languages-journeys-test.ts
// No network and no API key: the AI module call is replaced by a fake provider.
import { ensureSeed } from "../lib/seed";
import { Academies, Users, Courses, Modules } from "../lib/queries";
import { queryOne, exec } from "../lib/db";
import { LANGUAGES, getT, normalizeLang, languageInstruction, localeFor } from "../lib/i18n";
import { en } from "../lib/i18n/en";
import { fr } from "../lib/i18n/fr";
import { es } from "../lib/i18n/es";
import { de } from "../lib/i18n/de";
import { layoutJourney } from "../lib/journeyLayout";
import { sanitizeJourneyDoc, safeHttpUrl, type JourneyDoc } from "../lib/journeyTypes";
import { Journeys } from "../lib/journeys";
import { journeyIssues, siteJourneyIssues } from "../lib/journeyVisibility";
import { defaultAcademyPage, journeysSectionStatus, withJourneysSection } from "../lib/academyPage";
import { ensureJourneysOnDesignedPage, loadPublishedDesign } from "../lib/academyPageContent";
import { AcademyPages } from "../lib/queries";
import { applyAcademyPlan } from "../lib/aiAcademyPlan";
import type { AcademyPlan } from "../lib/ai";
import type { ContentProvider } from "../lib/aiModuleBuild";
import type { ModuleContext } from "../lib/aiModuleContent";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail ? " :: " + detail : ""}`);
}
const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");

async function main() {
  // ---------- translations ----------
  const tables = { fr, es, de } as const;
  for (const [code, table] of Object.entries(tables)) {
    const missing = Object.keys(en).filter((k) => !(k in table));
    const extra = Object.keys(table).filter((k) => !(k in en));
    check(`${code}: has exactly the English keys`, missing.length === 0 && extra.length === 0, `missing=${missing.join(",")} extra=${extra.join(",")}`);
    let bad = "";
    let sameAsEnglish = 0;
    for (const [k, v] of Object.entries(en)) {
      const o = (table as Record<string, unknown>)[k] as string | { one: string; other: string };
      if (typeof v === "string") {
        if (typeof o !== "string") bad += ` ${k}(shape)`;
        else {
          if (placeholders(o) !== placeholders(v)) bad += ` ${k}(placeholders)`;
          if (o === v && v.length > 12) sameAsEnglish++;
          if (!o.trim()) bad += ` ${k}(empty)`;
        }
      } else {
        if (typeof o !== "object" || !o.one || !o.other) bad += ` ${k}(plural)`;
        else if (placeholders(o.one) !== placeholders(v.one) || placeholders(o.other) !== placeholders(v.other)) bad += ` ${k}(placeholders)`;
      }
    }
    check(`${code}: placeholders and plural shapes match English`, bad === "", bad);
    check(`${code}: long strings are actually translated`, sameAsEnglish <= 3, `${sameAsEnglish} identical to English`);
  }
  check("Four languages offered: English, French, Spanish, German", LANGUAGES.map((l) => l.code).join() === "en,fr,es,de");
  check("normalizeLang falls back to English", normalizeLang("xx") === "en" && normalizeLang(undefined) === "en" && normalizeLang("FR") === "fr");
  check("getT substitutes placeholders", getT("fr")("site_about", { name: "Acme" }) === "À propos de Acme", getT("fr")("site_about", { name: "Acme" }));
  check("getT picks plural forms", getT("de")("site_count_courses", { n: 1 }) === "1 Kurs" && getT("de")("site_count_courses", { n: 3 }) === "3 Kurse");
  check("English wording is unchanged from before", getT("en")("site_start_learning") === "Start Learning" && getT("en")("catalog_summary", { n: 1, name: "X" }) === "1 course available at X.");
  check("languageInstruction is empty for English and names the language otherwise", languageInstruction("en") === "" && languageInstruction("es").includes("Spanish"));
  check("locales", localeFor("fr") === "fr-FR" && localeFor("de") === "de-DE");

  // ---------- journey validation ----------
  const good = sanitizeJourneyDoc({
    title: "  Leadership  ",
    description: "d",
    published: true,
    lines: [
      { id: "a", name: "Middle Leader", color: "#D6336C" },
      { id: "b", name: "Headteacher", color: "red" },
      { id: "a", name: "duplicate id", color: "#000000" },
    ],
    stations: [
      { id: "s1", kind: "ACTIVITY", title: "Workshop", url: "https://example.com/x" },
      { id: "s2", kind: "ACTIVITY", title: "Placement" },
    ],
    stops: { a: ["s1", "s2", "s1", "nope"], b: ["s2"], ghost: ["s1"] },
  });
  check("sanitizer accepts a valid journey", !!good.doc, good.error);
  if (good.doc) {
    check("title trimmed, duplicate line ids dropped", good.doc.title === "Leadership" && good.doc.lines.length === 2);
    check("bad colour replaced by a palette colour; good colour lower-cased", /^#[0-9a-f]{6}$/.test(good.doc.lines[1].color) && good.doc.lines[0].color === "#d6336c");
    check("stops: duplicates, unknown stations and unknown lines dropped", good.doc.stops.a.join() === "s1,s2" && good.doc.stops.b.join() === "s2" && !("ghost" in good.doc.stops));
  }
  check("sanitizer rejects javascript: links", !!sanitizeJourneyDoc({ title: "T", lines: [], stations: [{ id: "x", kind: "ACTIVITY", title: "A", url: "javascript:alert(1)" }], stops: {} }).error);
  check("sanitizer rejects a course station with no course", !!sanitizeJourneyDoc({ title: "T", lines: [], stations: [{ id: "x", kind: "COURSE", title: "A" }], stops: {} }).error);
  check("sanitizer rejects an empty title", !!sanitizeJourneyDoc({ title: "  ", lines: [], stations: [], stops: {} }).error);
  check("sanitizer rejects non-objects", !!sanitizeJourneyDoc(null).error && !!sanitizeJourneyDoc("x").error);
  check("safeHttpUrl", safeHttpUrl("https://a.example/x") !== null && safeHttpUrl("ftp://a") === null && safeHttpUrl("data:text/html,x") === null);

  // ---------- map layout ----------
  const lines = [
    { id: "L1", name: "One", color: "#111111" },
    { id: "L2", name: "Two", color: "#222222" },
  ];
  const stops = { L1: ["a", "b", "x", "c"], L2: ["d", "x", "e"] };
  const lay = layoutJourney(lines, stops, ["a", "b", "c", "d", "e", "x"]);
  const pos = Object.fromEntries(lay.stations.map((s) => [s.id, s]));
  check("every placed station has finite coordinates", lay.stations.every((s) => Number.isFinite(s.x) && Number.isFinite(s.y)) && lay.stations.length === 6);
  check("stops run left to right along a line", pos.a.x < pos.b.x && pos.b.x < pos.x.x && pos.x.x < pos.c.x && pos.d.x < pos.x.x && pos.x.x < pos.e.x);
  check("a shared station is one interchange on both lines", pos.x.interchange && pos.x.lineIds.length === 2 && !pos.a.interchange);
  check("the interchange is reachable by both lines (column after the longer run)", pos.x.col === 2);
  check("top lane labels rise, other lanes hang below", pos.a.labelUp && !pos.d.labelUp);
  check("two paths drawn, no NaN", lay.paths.length === 2 && lay.paths.every((p) => !p.d.includes("NaN")));
  check("canvas is big enough for every station", lay.stations.every((s) => s.x < lay.width && s.y < lay.height));
  const cyc = layoutJourney(lines, { L1: ["a", "b"], L2: ["b", "a"] }, ["a", "b"]);
  check("conflicting orders on two lines still lay out (no hang, no NaN)", cyc.paths.length === 2 && cyc.stations.every((s) => Number.isFinite(s.x)));
  check("empty journey lays out", layoutJourney([], {}, []).stations.length === 0);

  // ---------- database ----------
  await ensureSeed();
  const academy = (await Academies.bySlug("brightwave"))!;
  const other = (await Academies.bySlug("riverside"))!;
  const admin = (await Users.byAcademyAndEmail(academy.id, "admin@brightwave.example"))!;
  const instructor = (await Users.byAcademyAndEmail(academy.id, "instructor@brightwave.example"))!;
  check("academies default to English", academy.language === "en");
  await Academies.setLanguage(academy.id, "fr");
  check("setLanguage stores French", (await Academies.byId(academy.id))!.language === "fr");
  await Academies.setLanguage(academy.id, "klingon");
  check("setLanguage ignores unknown languages (falls back to English)", (await Academies.byId(academy.id))!.language === "en");

  const created = await Academies.create({
    slug: "lang-test-" + Date.now().toString(36),
    name: "Académie Test",
    sector: "Test",
    logo_text: "Académie Test",
    contact_email: "lang@example.test",
    trial_days: 14,
    plan_id: academy.plan_id,
    template_id: academy.template_id,
    language: "de",
  }).catch((e: Error) => e);
  check("Academies.create accepts a language", !(created instanceof Error) && created.language === "de", created instanceof Error ? created.message : "");
  if (!(created instanceof Error)) {
    await Academies.softDelete(created.id);
    await Academies.permanentlyDelete(created.id);
  }

  // AI language reaches the module builder
  await Academies.setLanguage(academy.id, "es");
  const seen: (string | undefined)[] = [];
  const spy: ContentProvider = {
    async slides(ctx: ModuleContext) {
      seen.push(ctx.language);
      return { deckTitle: ctx.moduleTitle, slides: [{ title: "Intro", bullets: ["Uno"], notes: "" }] };
    },
    async document(ctx: ModuleContext) {
      seen.push(ctx.language);
      return { title: ctx.moduleTitle, intro: "x", sections: [{ heading: "H", paragraphs: ["p"], bullets: [] }] };
    },
    async exercises(ctx: ModuleContext) {
      seen.push(ctx.language);
      return { title: ctx.moduleTitle, intro: "x", sections: [{ heading: "H", paragraphs: ["p"], bullets: [] }] };
    },
    async scorm(ctx: ModuleContext) {
      seen.push(ctx.language);
      return { title: ctx.moduleTitle, pages: [{ heading: "P", paragraphs: ["p"], bullets: [] }], questions: [{ question: "Q?", options: ["A", "B"], correctIndex: 0, explanation: "" }], passMarkPct: 70 };
    },
    async videoBrief(ctx: ModuleContext) {
      seen.push(ctx.language);
      return { script: "s", durationMinutes: 3 };
    },
  };
  const plan: AcademyPlan = {
    academyName: "T",
    slugSuggestion: "t",
    heroHeadline: "h",
    heroTagline: "t",
    aboutText: "a",
    learningOutcomes: [],
    template: { name: "Lang T", description: "d", primary_color: "#0B1F3B", secondary_color: "#1E3A5F", accent_color: "#F59E0B", font_heading: "Inter" },
    homepageBlocks: [],
    courses: [{ title: "Curso", description: "d", category: "x", courseType: "SELF_PACED", level: "BEGINNER", studyHours: 0, modules: [{ title: "Mazo", description: "d", kind: "SLIDES" }] }],
  };
  const before = await Courses.listByAcademy(academy.id);
  await applyAcademyPlan({ academyId: academy.id, createdByUserId: admin.id, plan, switchTemplate: false, provider: spy });
  check("module AI calls carry the academy's language", seen.length > 0 && seen.every((l) => l === "es"), seen.join());
  const madeCourses = (await Courses.listByAcademy(academy.id)).filter((c) => !before.some((b) => b.id === c.id));
  for (const c of madeCourses) {
    for (const m of await Modules.listByCourse(c.id)) await exec("DELETE FROM modules WHERE id = $1", [m.id]);
    await exec("DELETE FROM courses WHERE id = $1", [c.id]);
  }
  await Academies.setLanguage(academy.id, "en");

  // journeys
  const course = (await Courses.listByAcademy(academy.id, true))[0];
  const draft = await Courses.create({
    academy_id: academy.id,
    created_by: admin.id,
    title: "Hidden draft course",
    description: "d",
    category: "x",
    price_pence: 0,
    cover_emoji: "📘",
  });
  await exec("UPDATE courses SET is_published = 0 WHERE id = $1", [draft.id]);
  const jid = await Journeys.create(academy.id, instructor.id, "Careers");
  const doc: JourneyDoc = {
    title: "Careers",
    description: "Pick a route",
    published: true,
    lines: [
      { id: "l1", name: "Middle Leader", color: "#d6336c" },
      { id: "l2", name: "Headteacher", color: "#1971c2" },
    ],
    stations: [
      { id: "s1", kind: "COURSE", courseId: course.id, moduleId: null, title: "Published course", description: "", url: null },
      { id: "s2", kind: "COURSE", courseId: draft.id, moduleId: null, title: "Draft course", description: "", url: null },
      { id: "s3", kind: "ACTIVITY", courseId: null, moduleId: null, title: "Workshop", description: "In person", url: "https://example.com/w" },
    ],
    stops: { l1: ["s1", "s3"], l2: ["s2", "s3"] },
  };
  await Journeys.save(jid, doc);
  const loaded = (await Journeys.load(jid))!;
  check("journey round-trips through the database", loaded.lines.length === 2 && loaded.stations.length === 3 && loaded.stops[loaded.lines[0].id].length === 2 && loaded.published === true);
  check("stop order is kept", loaded.stops[loaded.lines[0].id].map((id) => loaded.stations.find((s) => s.id === id)!.title).join() === "Published course,Workshop");
  check("the shared station is on both lines", loaded.stops[loaded.lines[0].id][1] === loaded.stops[loaded.lines[1].id][1]);
  await Journeys.save(jid, { ...doc, title: "Careers v2", stops: { l1: ["s3"], l2: [] } });
  const resaved = (await Journeys.load(jid))!;
  check("saving again replaces lines, stations and stops", resaved.title === "Careers v2" && resaved.stops[resaved.lines[0].id].length === 1 && (await queryOne<{ n: string }>("SELECT count(*) AS n FROM journey_stops WHERE line_id IN (SELECT id FROM journey_lines WHERE journey_id = $1)", [jid]))!.n === "1");
  await Journeys.save(jid, doc);

  let views = await Journeys.publishedViews(academy.id, "brightwave");
  const view = views.find((v) => v.id === jid)!;
  const st = (title: string) => view.stations.find((s) => s.title === title)!;
  check("published journey is in the public views", !!view);
  check("published course station links to the public course page", st("Published course").href === `/a/brightwave/courses/${course.id}`);
  check("draft course station has NO link (not exposed)", st("Draft course").href === null);
  check("activity station keeps its https link", st("Workshop").href === "https://example.com/w" && st("Workshop").hrefKind === "link");
  check("another academy sees none of it", (await Journeys.publishedViews(other.id, "riverside")).every((v) => v.id !== jid));
  await Journeys.save(jid, { ...doc, published: false });
  views = await Journeys.publishedViews(academy.id, "brightwave");
  check("an unpublished journey is not shown publicly", !views.some((v) => v.id === jid));
  check("admin list shows it; instructor list (own) shows it", (await Journeys.list(academy.id)).some((j) => j.id === jid) && (await Journeys.list(academy.id, instructor.id)).some((j) => j.id === jid));
  check("another person's own-list does not", !(await Journeys.list(academy.id, admin.id)).some((j) => j.id === jid));

  // deleting a course leaves the station (unlinked) instead of failing
  await exec("DELETE FROM courses WHERE id = $1", [draft.id]);
  const afterDelete = (await Journeys.load(jid))!;
  check("deleting a linked course keeps the station", afterDelete.stations.length === 3 && afterDelete.stations.some((s) => s.title === "Draft course" && s.courseId === null));

  // erasing an academy removes its journeys
  const tmp = await Academies.create({
    slug: "jt-" + Date.now().toString(36),
    name: "Journey Temp",
    sector: "Test",
    logo_text: "Journey Temp",
    contact_email: "jt@example.test",
    trial_days: 14,
    plan_id: academy.plan_id,
    template_id: academy.template_id,
  });
  const tmpUser = await Users.create({ academy_id: tmp.id, name: "T", email: "t@example.test", password_hash: "x", role: "ACADEMY_ADMIN" });
  const tj = await Journeys.create(tmp.id, tmpUser.id, "Temp journey");
  await Journeys.save(tj, { ...doc, stations: [doc.stations[2]], stops: { l1: ["s3"], l2: [] } });
  await Academies.softDelete(tmp.id);
  let err = "";
  try {
    await Academies.permanentlyDelete(tmp.id);
  } catch (e) {
    err = (e as Error).message;
  }
  check("permanently deleting an academy removes its journeys", !err && (await queryOne<{ n: string }>("SELECT count(*) AS n FROM learning_journeys WHERE academy_id = $1", [tmp.id]))!.n === "0", err);

  // ---------- why a journey might not show on the home page ----------
  const fresh = await Journeys.create(academy.id, instructor.id, "Fresh");
  const freshRow = (await Journeys.list(academy.id)).find((j) => j.id === fresh)!;
  check("a new journey is switched on by default", freshRow.is_published === 1);
  check("...but is flagged as empty until a station sits on a pathway", journeyIssues(freshRow).some((i) => i.code === "empty") && freshRow.stop_count === 0);
  check("a journey with stops and switched on has no issues", journeyIssues({ is_published: 1, stop_count: 2 }).length === 0);
  check("a switched-off journey is flagged", journeyIssues({ is_published: 0, stop_count: 2 }).some((i) => i.code === "journey_off"));
  check("an unpublished academy site is flagged for admins with a fix link", siteJourneyIssues({ slug: "brightwave", siteLive: false, design: null, area: "admin" }).some((i) => i.code === "site_unpublished" && !!i.fixHref));

  const bare = defaultAcademyPage({ slug: academy.slug, name: academy.name, headline: "", tagline: "", blocks: [] });
  const noJourneys = { ...bare, sections: bare.sections.filter((x) => x.type !== "journeys") };
  check("a designed page without a journeys block is detected", journeysSectionStatus(noJourneys) === "missing");
  check("...and flagged", siteJourneyIssues({ slug: "brightwave", siteLive: true, design: noJourneys, area: "admin" }).some((i) => i.code === "design_missing"));
  const fixed = withJourneysSection(noJourneys, academy.slug);
  const coursesAt = fixed.sections.findIndex((x) => x.type === "courses");
  check("the journeys block is added right after the courses block", fixed.sections[coursesAt + 1]?.type === "journeys" && journeysSectionStatus(fixed) === "ok");
  const hidden = { ...bare, sections: bare.sections.map((x) => (x.type === "journeys" ? { ...x, visible: false } : x)) };
  check("a hidden journeys block is detected and switched back on", journeysSectionStatus(hidden) === "hidden" && journeysSectionStatus(withJourneysSection(hidden, academy.slug)) === "ok");

  await AcademyPages.publish(academy.id, JSON.stringify(noJourneys), admin.id);
  await AcademyPages.saveDraft(academy.id, JSON.stringify(noJourneys), admin.id);
  const changed = await ensureJourneysOnDesignedPage(academy, admin.id);
  const liveNow = await loadPublishedDesign(academy);
  const rowNow = await AcademyPages.get(academy.id);
  check("putting a journey on the home page repairs the live designed page", changed && !!liveNow && journeysSectionStatus(liveNow) === "ok");
  check("...and keeps the unpublished draft (also repaired)", !!rowNow?.draft_json && rowNow.draft_json.includes('"journeys"'));
  check("running it again changes nothing", (await ensureJourneysOnDesignedPage(academy, admin.id)) === false);
  await AcademyPages.unpublish(academy.id);
  await AcademyPages.discardDraft(academy.id);
  await Journeys.remove(fresh);

  await Journeys.remove(jid);
  check("journey delete cascades", (await queryOne<{ n: string }>("SELECT count(*) AS n FROM journey_stations WHERE journey_id = $1", [jid]))!.n === "0");

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
