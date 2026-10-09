// Integration test for the AI "rich module" pipeline — PowerPoint, Word,
// SCORM, video and link modules generated from an academy plan. Runs the
// real plan applier against a real (seeded) Postgres database and real file
// storage, but swaps the Anthropic call for a deterministic fake content
// provider, so it needs no ANTHROPIC_API_KEY and no network.
//
//   DATABASE_URL=postgres://… npx tsx scripts/ai-modules-test.ts
//
// Creates throwaway courses/modules on the seeded "brightwave" academy and
// deletes them again at the end.
import JSZip from "jszip";
import { ensureSeed } from "../lib/seed";
import { Academies, Users, Modules, ScormPackages, Courses } from "../lib/queries";
import { exec } from "../lib/db";
import { readFile } from "../lib/storage";
import { applyAcademyPlan } from "../lib/aiAcademyPlan";
import { sanitizeAcademyPlan, keepOnlyPromptUrls, MAX_RICH_MODULES, type AcademyPlan } from "../lib/ai";
import { parseVideoUrl } from "../lib/videoModule";
import { safeHttpUrl } from "../lib/safeUrl";
import { readScormZip } from "../lib/scorm/install";
import type { ContentProvider } from "../lib/aiModuleBuild";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail ? " :: " + detail : ""}`);
}

let DELAY_MS = 0;
const fakeProvider: ContentProvider = {
  async slides(ctx) {
    await new Promise((r) => setTimeout(r, DELAY_MS));
    if (ctx.moduleTitle.includes("BOOM")) throw new Error("simulated AI failure");
    return {
      deckTitle: ctx.moduleTitle,
      slides: [
        { title: "Intro", bullets: ["One", "Two", "Three"], notes: "Say hello" },
        { title: "Detail", bullets: ["Alpha", "Beta"], notes: "" },
      ],
    };
  },
  async document(ctx) {
    return { title: ctx.moduleTitle, intro: "Intro text", sections: [{ heading: "Part 1", paragraphs: ["Para"], bullets: ["Point"] }] };
  },
  async exercises(ctx) {
    await new Promise((r) => setTimeout(r, DELAY_MS));
    if (ctx.moduleTitle.includes("NOEX")) throw new Error("simulated exercises failure");
    return { title: `Exercises: ${ctx.moduleTitle}`, intro: "Do these", sections: [{ heading: "Exercise 1: Apply it", paragraphs: ["Task text"], bullets: ["Step"] }] };
  },
  async scorm(ctx) {
    return {
      title: ctx.moduleTitle,
      pages: [{ heading: "Page 1", paragraphs: ["Teach"], bullets: [] }],
      questions: [{ question: "Q?", options: ["A", "B"], correctIndex: 0, explanation: "Because" }],
      passMarkPct: 70,
    };
  },
  async videoBrief(ctx) {
    return { script: `Scene 1 for ${ctx.moduleTitle}`, durationMinutes: 4 };
  },
};

function basePlan(modules: AcademyPlan["courses"][number]["modules"]): AcademyPlan {
  return {
    academyName: "Test Academy",
    slugSuggestion: "test-academy",
    heroHeadline: "Hello",
    heroTagline: "Tag",
    aboutText: "About",
    template: { name: "T", description: "d", primary_color: "#0B1F3B", secondary_color: "#1E3A5F", accent_color: "#F59E0B", font_heading: "Inter" },
    homepageBlocks: [],
    courses: [{ title: "AI Rich Course", description: "Course desc", category: "Test", modules }],
  };
}

async function main() {
  await ensureSeed();
  const academy = await Academies.bySlug("brightwave");
  if (!academy) throw new Error("seeded brightwave academy not found");
  const admin = (await Users.listByAcademy(academy.id, "ACADEMY_ADMIN"))[0];
  const createdCourseIds: string[] = [];
  const createdModuleIds: string[] = [];

  try {
    // ---- sanitiser / URL rules (no DB) ----
    // 2 courses x 3 modules (the per-plan limits), all SLIDES. Each deck also
    // carries a Word exercise sheet, so only 4 of the 6 fit in the 8-file cap.
    const rawCourses = Array.from({ length: 2 }, (_, c) => ({
      title: `C${c}`, description: "d", category: "x",
      modules: Array.from({ length: 3 }, (_, i) => ({ title: `S${c}-${i}`, description: "d", kind: "SLIDES" })),
    }));
    const capped = sanitizeAcademyPlan({ ...basePlan([]), courses: rawCourses })!;
    const allCapped = capped.courses.flatMap((c) => c.modules);
    check(`Every PowerPoint module is planned with a Word exercise sheet`, allCapped.filter((m) => m.kind === "SLIDES").every((m) => m.exercises === true));
    check(`Decks plus exercise sheets are capped at ${MAX_RICH_MODULES} files; the rest fall back to TEXT`,
      allCapped.filter((m) => m.kind === "SLIDES").length === MAX_RICH_MODULES / 2 &&
        allCapped.filter((m) => m.kind === "TEXT" && !m.exercises).length === 6 - MAX_RICH_MODULES / 2);
    const mixed = sanitizeAcademyPlan({
      ...basePlan([]),
      courses: [{ title: "M", description: "d", category: "x", modules: [
        { title: "D1", description: "d", kind: "DOCUMENT" },
        { title: "D2", description: "d", kind: "DOCUMENT" },
        { title: "D3", description: "d", kind: "DOCUMENT" },
      ] }, { title: "N", description: "d", category: "x", modules: [
        { title: "A", description: "d", kind: "SLIDES" },
        { title: "B", description: "d", kind: "SLIDES" },
        { title: "C", description: "d", kind: "SLIDES" },
      ] }],
    })!;
    const mm = mixed.courses[1].modules;
    check("A deck with room for itself but not its exercises keeps the deck only", mm[0].exercises === true && mm[1].exercises === true && mm[2].kind === "SLIDES" && !mm[2].exercises);
    check("Non-PowerPoint modules never carry an exercises flag", mixed.courses[0].modules.every((m) => !m.exercises));

    const urls = sanitizeAcademyPlan({
      ...basePlan([]),
      courses: [{ title: "C", description: "d", category: "x", modules: [
        { title: "Bad", description: "d", kind: "URL", url: "javascript:alert(1)" },
        { title: "Slides link ignored", description: "d", kind: "SLIDES", url: "https://example.com/x" },
        { title: "Good", description: "d", kind: "URL", url: "https://example.com/handbook" },
      ] }, { title: "C2", description: "d", category: "x", modules: [
        { title: "Unknown kind", description: "d", kind: "HOLOGRAM" },
      ] }],
    })!;
    const um = urls.courses[0].modules;
    check("javascript: URLs are dropped by the sanitiser", um[0].url === undefined && um[0].kind === "URL");
    check("URLs on non-link kinds are dropped", um[1].url === undefined);
    check("A valid https URL on a URL module is kept", um[2].url === "https://example.com/handbook");
    check("Unknown module kinds fall back to TEXT", urls.courses[1].modules[0].kind === "TEXT");

    keepOnlyPromptUrls(urls, "Please link to https://example.com/handbook, thanks");
    check("keepOnlyPromptUrls keeps a URL the admin typed (even with trailing punctuation)", urls.courses[0].modules[2].url === "https://example.com/handbook");
    keepOnlyPromptUrls(urls, "no links here");
    check("keepOnlyPromptUrls removes a URL the admin never typed", urls.courses[0].modules[2].url === undefined);

    check("safeHttpUrl rejects credentials in URLs", safeHttpUrl("https://user:pw@example.com/") === null);
    check("safeHttpUrl rejects data: URLs", safeHttpUrl("data:text/html,hi") === null);
    check("parseVideoUrl: YouTube watch link -> nocookie embed", parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")?.embedUrl === "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    check("parseVideoUrl: youtu.be link", parseVideoUrl("https://youtu.be/dQw4w9WgXcQ")?.kind === "youtube");
    check("parseVideoUrl: Vimeo link", parseVideoUrl("https://vimeo.com/123456789")?.embedUrl === "https://player.vimeo.com/video/123456789");
    check("parseVideoUrl: direct .mp4", parseVideoUrl("https://cdn.example.com/a/b.mp4")?.kind === "file");
    check("parseVideoUrl: arbitrary page is not embedded", parseVideoUrl("https://evil.example.com/page") === null);
    check("parseVideoUrl: http (non-https) rejected", parseVideoUrl("http://youtu.be/dQw4w9WgXcQ") === null);
    check("parseVideoUrl: bogus YouTube id rejected", parseVideoUrl("https://www.youtube.com/watch?v=<script>") === null);

    // ---- full apply with the fake provider ----
    const plan = basePlan([
      { title: "Deck module", description: "Slides please", kind: "SLIDES" },
      { title: "Handout module", description: "A guide", kind: "DOCUMENT" },
      { title: "Interactive module", description: "E-learning", kind: "SCORM" },
      { title: "Script-only video", description: "No link given", kind: "VIDEO" },
      { title: "Linked video", description: "Admin link", kind: "VIDEO", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
      { title: "Handbook link", description: "Admin link", kind: "URL", url: "https://example.com/handbook" },
      { title: "Empty link module", description: "No link given", kind: "URL" },
      { title: "Plain text module", description: "Outline", kind: "TEXT" },
      { title: "BOOM deck", description: "AI fails here", kind: "SLIDES" },
    ]);
    const result = await applyAcademyPlan({ academyId: academy.id, createdByUserId: admin.id, plan, switchTemplate: false, provider: fakeProvider });
    check("Apply reports 9 modules", result.moduleCount === 9, String(result.moduleCount));
    check("Apply reports 1 fallback (the failing AI call)", result.fallbackCount === 1, String(result.fallbackCount));
    check("Apply reports 7 rich/link modules", result.richModuleCount === 7, String(result.richModuleCount));

    const course = (await Courses.listByAcademy(academy.id)).find((c) => c.title === "AI Rich Course" && !createdCourseIds.includes(c.id));
    if (!course) throw new Error("course not created");
    createdCourseIds.push(course.id);
    const mods = await Modules.listByCourse(course.id);
    mods.forEach((m) => createdModuleIds.push(m.id));
    const byTitle = (t: string) => mods.find((m) => m.title === t)!;
    check("Modules are attached to the course in the planned order", mods.map((m) => m.title).join("|") === plan.courses[0].modules.map((m) => m.title).join("|"));

    const deck = byTitle("Deck module");
    check("SLIDES -> FILE module with .pptx name + mime", deck.content_type === "FILE" && !!deck.file_name?.endsWith(".pptx") && deck.file_mime!.includes("presentationml"));
    const deckBuf = deck.file_path ? await readFile(deck.file_path) : null;
    const deckZip = deckBuf ? await JSZip.loadAsync(deckBuf) : null;
    check("PPTX in storage is a valid OOXML zip with 3 slides (title + 2)", !!deckZip && !!deckZip.file("[Content_Types].xml") && Object.keys(deckZip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length === 3);
    check("PPTX file_size matches stored bytes", !!deckBuf && deck.file_size === deckBuf.length);

    const handout = byTitle("Handout module");
    const docBuf = handout.file_path ? await readFile(handout.file_path) : null;
    const docZip = docBuf ? await JSZip.loadAsync(docBuf) : null;
    const docXml = docZip ? await docZip.file("word/document.xml")?.async("string") : "";
    check("DOCUMENT -> FILE module with .docx name + mime", handout.content_type === "FILE" && !!handout.file_name?.endsWith(".docx") && handout.file_mime!.includes("wordprocessingml"));
    check("DOCX in storage is a valid zip containing the generated text", !!docXml && docXml.includes("Part 1") && docXml.includes("Intro text"));

    const sc = byTitle("Interactive module");
    const pkg = await ScormPackages.byModule(sc.id);
    check("SCORM -> SCORM module with a registered package", sc.content_type === "SCORM" && !!pkg && pkg.launch_path === "index.html" && pkg.version === "1.2");
    const launch = pkg ? await readFile(`${pkg.storage_prefix}/${pkg.launch_path}`) : null;
    check("SCORM launch file is stored and contains the lesson + quiz", !!launch && launch.toString().includes("Page 1") && launch.toString().includes("Q?"));
    const manifest = pkg ? await readFile(`${pkg.storage_prefix}/imsmanifest.xml`) : null;
    check("SCORM manifest is stored", !!manifest && manifest.toString().includes("<schemaversion>1.2</schemaversion>"));
    // Re-zip what was stored and make sure the real parser still accepts it.
    if (pkg) {
      const z = new JSZip();
      z.file("imsmanifest.xml", manifest!);
      z.file("index.html", launch!);
      const reread = await readScormZip(await z.generateAsync({ type: "nodebuffer" }));
      check("Stored SCORM package round-trips through the real manifest parser", reread.parsed.launchHref === "index.html");
    }

    const vidScript = byTitle("Script-only video");
    check("VIDEO without a link -> VIDEO module holding a script, no video source", vidScript.content_type === "VIDEO" && !vidScript.content_url && !vidScript.file_path && !!vidScript.content_text?.includes("Scene 1"));
    const vidLink = byTitle("Linked video");
    check("VIDEO with an admin-supplied link keeps it and skips AI", vidLink.content_type === "VIDEO" && vidLink.content_url === "https://www.youtube.com/watch?v=dQw4w9WgXcQ" && !vidLink.content_text);

    const link = byTitle("Handbook link");
    check("URL with an admin-supplied link keeps it", link.content_type === "URL" && link.content_url === "https://example.com/handbook");
    const emptyLink = byTitle("Empty link module");
    check("URL without a link is an empty URL module (nothing invented)", emptyLink.content_type === "URL" && !emptyLink.content_url);

    const text = byTitle("Plain text module");
    check("TEXT stays a text outline", text.content_type === "TEXT" && !!text.content_text?.includes("Draft outline"));

    const boom = byTitle("BOOM deck");
    check("A failed AI call falls back to a flagged TEXT draft", boom.content_type === "TEXT" && !!boom.content_text?.includes("couldn't be generated automatically") && !boom.file_path);

    // ---- no time left: every rich module falls back, nothing throws ----
    const rushed = await applyAcademyPlan({
      academyId: academy.id,
      createdByUserId: admin.id,
      plan: basePlan([
        { title: "Rushed deck", description: "d", kind: "SLIDES" },
        { title: "Rushed scorm", description: "d", kind: "SCORM" },
      ]),
      switchTemplate: false,
      provider: fakeProvider,
      budgetMs: 500,
    });
    check("With the time budget exhausted every rich module falls back to text", rushed.fallbackCount === 2 && rushed.richModuleCount === 0, JSON.stringify(rushed));
    const course2 = (await Courses.listByAcademy(academy.id)).find((c) => c.title === "AI Rich Course" && !createdCourseIds.includes(c.id));
    if (course2) {
      createdCourseIds.push(course2.id);
      (await Modules.listByCourse(course2.id)).forEach((m) => createdModuleIds.push(m.id));
    }

    // ---- PowerPoint + Word exercises per module, built in one parallel wave ----
    DELAY_MS = 400;
    const packPlan: AcademyPlan = {
      ...basePlan([]),
      courses: [
        { title: "Pack Course A", description: "A desc", category: "t", modules: [
          { title: "Alpha", description: "d", kind: "SLIDES", exercises: true },
          { title: "NOEX Beta", description: "d", kind: "SLIDES", exercises: true },
        ] },
        { title: "Pack Course B", description: "B desc", category: "t", modules: [
          { title: "Gamma", description: "d", kind: "SLIDES", exercises: true },
        ] },
      ],
    };
    const packStart = Date.now();
    const pack = await applyAcademyPlan({ academyId: academy.id, createdByUserId: admin.id, plan: packPlan, switchTemplate: false, provider: fakeProvider });
    const packMs = Date.now() - packStart;
    DELAY_MS = 0;
    const all = await Courses.listByAcademy(academy.id);
    const cA = all.find((c) => c.title === "Pack Course A")!;
    const cB = all.find((c) => c.title === "Pack Course B")!;
    createdCourseIds.push(cA.id, cB.id);
    const modsA = await Modules.listByCourse(cA.id);
    const modsB = await Modules.listByCourse(cB.id);
    [...modsA, ...modsB].forEach((m) => createdModuleIds.push(m.id));
    check("Each deck is followed by its Word exercises module, in order", modsA.map((m) => m.title).join("|") === "Alpha|Alpha — Exercises|NOEX Beta" && modsB.map((m) => m.title).join("|") === "Gamma|Gamma — Exercises", modsA.map((m) => m.title).join("|") + " // " + modsB.map((m) => m.title).join("|"));
    const ex = modsA[1];
    check("Exercises -> a .docx FILE module", ex.content_type === "FILE" && !!ex.file_name?.endsWith(".docx") && !!ex.file_mime?.includes("wordprocessingml"));
    const exBuf = ex.file_path ? await readFile(ex.file_path) : null;
    const exXml = exBuf ? await (await JSZip.loadAsync(exBuf)).file("word/document.xml")?.async("string") : null;
    check("Exercises file contains the generated exercise text", !!exXml && exXml.includes("Exercise 1") && exXml.includes("Task text"));
    check("A failed exercises call is skipped (deck kept) and counted as a fallback", pack.fallbackCount === 1 && modsA[2].title === "NOEX Beta" && modsA[2].content_type === "FILE", JSON.stringify(pack));
    check("Apply reports 5 files (3 decks + 2 exercise sheets) across both courses", pack.richModuleCount === 5 && pack.moduleCount === 5, JSON.stringify(pack));
    check("All courses' modules are built in one wave, not course by course", packMs < 1100, `${packMs}ms (would be ~800ms+ sequential per course)`);
  } finally {
    for (const id of createdCourseIds) await exec("DELETE FROM courses WHERE id = $1", [id]);
    for (const id of createdModuleIds) await exec("DELETE FROM modules WHERE id = $1", [id]);
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
