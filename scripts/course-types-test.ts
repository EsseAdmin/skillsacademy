// Tests for pass 35: course types/levels/hours helpers, the SVG sanitiser for AI pictures,
// AI-plan fields, and picture jobs in the build queue (the drawing model is faked).
//
//   DATABASE_URL=postgres://… npx tsx scripts/course-types-test.ts
import { ensureSeed } from "../lib/seed";
import { Academies, Users, Modules, Courses } from "../lib/queries";
import { queueAcademyPlan } from "../lib/aiAcademyPlan";
import { runBuildStep, buildProgress } from "../lib/aiBuildJobs";
import { sanitizeAcademyPlan, type AcademyPlan } from "../lib/ai";
import { sanitizeSvg } from "../lib/svgSafe";
import { designIllustration, type SvgDrawer } from "../lib/aiIllustration";
import { illustrateCourse } from "../lib/illustrationStore";
import { readFile } from "../lib/storage";
import * as T from "../lib/courseTypes";
import type { ContentProvider } from "../lib/aiModuleBuild";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail ? " :: " + detail : ""}`);
}

async function main() {
// ---- helpers ----
check("normalizeCourseType accepts words and falls back to self-paced", T.normalizeCourseType("instructor-led") === "INSTRUCTOR_LED" && T.normalizeCourseType("certification") === "CERTIFICATION" && T.normalizeCourseType("nonsense") === "SELF_PACED" && T.normalizeCourseType(null) === "SELF_PACED");
check("normalizeLevel", T.normalizeLevel("advanced") === "ADVANCED" && T.normalizeLevel("x") === "BEGINNER");
check("normalizeHours: half hours, capped, junk = 0", T.normalizeHours("7.3") === 7.5 && T.normalizeHours("1,5") === 1.5 && T.normalizeHours(-3) === 0 && T.normalizeHours("abc") === 0 && T.normalizeHours(5000) === 999);
check("enabled types: null = all, '' = none, list parsed", T.parseEnabledTypes(null).length === 3 && T.parseEnabledTypes("").length === 0 && T.parseEnabledTypes("CERTIFICATION,bogus").join() === "CERTIFICATION");
check("serializeEnabledTypes keeps a fixed order", T.serializeEnabledTypes(["INSTRUCTOR_LED", "SELF_PACED"]) === "SELF_PACED,INSTRUCTOR_LED");
check("isTypeEnabled treats unknown course types as self-paced", T.isTypeEnabled("SELF_PACED", "weird") && !T.isTypeEnabled("CERTIFICATION", "weird"));
check("courseStudyHours: own figure wins, else modules, else 0", T.courseStudyHours(6, 600) === 6 && T.courseStudyHours(0, 90) === 1.5 && T.courseStudyHours(0, 10) === 0.5 && T.courseStudyHours(0, 0) === 0);
check("formatHoursNumber", T.formatHoursNumber(2) === "2" && T.formatHoursNumber(7.5) === "7.5");

// ---- SVG sanitiser ----
const good = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450"><defs><linearGradient id="g"><stop offset="0" stop-color="#112233"/><stop offset="1" stop-color="#445566"/></linearGradient></defs><rect width="800" height="450" fill="url(#g)"/><circle cx="400" cy="200" r="80" fill="#fc0"/><path d="M10 10 L100 100 Z" fill="#fff"/></svg>`;
const cleaned = sanitizeSvg(good);
check("a well-formed illustration is kept", !!cleaned && cleaned.includes("<circle") && cleaned.includes('viewBox="0 0 800 450"'));
const evil = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" onload="alert(1)"><script>alert(1)</script><rect width="800" height="450" fill="#123" onclick="x()"/><circle cx="1" cy="1" r="9" fill="javascript:alert(1)"/><image href="http://evil/x.png"/><a href="http://evil"><rect width="5" height="5"/></a><foreignObject><div>hi</div></foreignObject><text>words</text><path d="M0 0 L9 9" style="fill:url(http://evil)" fill="#fff"/><ellipse cx="3" cy="3" rx="2" ry="2" fill="#abc"/></svg>`;
const ev = sanitizeSvg(evil) ?? "";
check("scripts, handlers, links, images, text, styles and javascript: values are stripped", ev !== "" && !/script|onload|onclick|javascript|evil|<image|<a |foreignObject|<text|style=|alert/i.test(ev), ev.slice(0, 200));
check("no drawing shapes = rejected", sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg"><g></g></svg>`) === null);
check("not SVG at all = rejected", sanitizeSvg("hello") === null && sanitizeSvg("<html></html>") === null && sanitizeSvg("") === null);
check("huge drawings are rejected", sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg">${'<rect width="1" height="1" fill="#fff"/>'.repeat(2000)}</svg>`) === null);

// ---- designIllustration with a fake drawer ----
const okDrawer: SvgDrawer = async () => good;
const badDrawer: SvgDrawer = async () => "<svg><script>1</script></svg>";
const req = { kind: "course" as const, title: "T", description: "D", colors: { primary: "#111111", secondary: "#222222", accent: "#333333" } };
const svg = await designIllustration(req, { timeoutMs: 1000, drawer: okDrawer });
check("designIllustration returns clean SVG from the drawer", svg.startsWith("<svg") && svg.includes("<circle"));
let rejected = false;
try {
  await designIllustration(req, { timeoutMs: 1000, drawer: badDrawer });
} catch {
  rejected = true;
}
check("an unusable drawing is an error (default picture stays)", rejected);

// ---- AI plan sanitiser ----
const rawPlan = {
  academyName: "A", slugSuggestion: "a", heroHeadline: "h", heroTagline: "t", aboutText: "a", learningOutcomes: [],
  template: { name: "n", description: "d", primary_color: "#112233", secondary_color: "#223344", accent_color: "#334455", font_heading: "Inter" },
  homepageBlocks: [],
  courses: [
    { title: "C1", description: "d", category: "x", courseType: "CERTIFICATION", level: "advanced", studyHours: 30.2, modules: [{ title: "m", description: "d", kind: "TEXT" }] },
    { title: "C2", description: "d", category: "x", courseType: "wat", level: 7, studyHours: "lots", modules: [{ title: "m", description: "d", kind: "TEXT" }] },
  ],
};
const sp = sanitizeAcademyPlan(rawPlan)!;
check("plan keeps type/level/hours chosen by the AI", sp.courses[0].courseType === "CERTIFICATION" && sp.courses[0].level === "ADVANCED" && sp.courses[0].studyHours === 30, JSON.stringify(sp.courses[0]));
check("plan falls back to self-paced / beginner / 0 hours on junk", sp.courses[1].courseType === "SELF_PACED" && sp.courses[1].level === "BEGINNER" && sp.courses[1].studyHours === 0);

// ---- queue: type fields reach the courses; picture jobs run with a fake drawer ----
await ensureSeed();
const academy = (await Academies.bySlug("brightwave"))!;
const admin = (await Users.listByAcademy(academy.id, "ACADEMY_ADMIN"))[0];
const provider: ContentProvider = {
  async slides(ctx) { return { deckTitle: ctx.moduleTitle, slides: [{ title: "Intro", bullets: ["One"], notes: "" }] }; },
  async document(ctx) { return { title: ctx.moduleTitle, intro: "i", sections: [{ heading: "H", paragraphs: ["p"], bullets: [] }] }; },
  async exercises(ctx) { return { title: ctx.moduleTitle, intro: "i", sections: [{ heading: "E", paragraphs: ["t"], bullets: [] }] }; },
  async scorm(ctx) { return { title: ctx.moduleTitle, pages: [{ heading: "P", paragraphs: ["x"], bullets: [] }], questions: [{ question: "Q?", options: ["A", "B"], correctIndex: 0, explanation: "e" }], passMarkPct: 70 }; },
  async videoBrief(ctx) { return { script: ctx.moduleTitle, durationMinutes: 3 }; },
};
let drawn = 0;
const drawer: SvgDrawer = async (r) => {
  drawn++;
  if (r.title.includes("NODRAW")) throw new Error("simulated drawing failure");
  return good;
};
const plan = { ...sp, courses: [
  { title: "Pic Course", description: "d", category: "x", courseType: "INSTRUCTOR_LED" as const, level: "INTERMEDIATE" as const, studyHours: 12, modules: [
    { title: "Pic Deck", description: "d", kind: "SLIDES" as const, exercises: true },
    { title: "NODRAW Doc", description: "d", kind: "DOCUMENT" as const },
  ] },
] } as AcademyPlan;
const created: string[] = [];
try {
  const q = await queueAcademyPlan({ academyId: academy.id, createdByUserId: admin.id, plan, switchTemplate: false });
  const course = (await Courses.listByAcademy(academy.id)).find((c) => c.title === "Pic Course")!;
  created.push(course.id);
  check("created course carries type, level and hours", course.course_type === "INSTRUCTOR_LED" && course.level === "INTERMEDIATE" && course.study_hours === 12, JSON.stringify([course.course_type, course.level, course.study_hours]));
  check("without AI configured, no picture jobs are queued", q.jobCount === 2 && (await buildProgress(academy.id)).total === 2, JSON.stringify(q));

  // Steps with a drawer: picture jobs for each built module (not the exercise sheet) join the same batch.
  for (let i = 0; i < 12; i++) {
    const s = await runBuildStep(academy.id, { provider, drawer, budgetMs: 15000 });
    if (s.ranJobs === 0) break;
  }
  const prog = await buildProgress(academy.id);
  const mods = await Modules.listByCourse(course.id);
  mods.forEach((m) => created.push(m.id));
  check("all jobs finished and none failed (pictures are best effort)", prog.pending === 0 && prog.failed === 0, JSON.stringify(prog));
  check("modules built: deck, exercises, document", mods.length === 3, mods.map((m) => m.title).join("|"));
  const deck = mods.find((m) => m.title === "Pic Deck")!;
  const ex = mods.find((m) => m.title.endsWith("Exercises"))!;
  const nodraw = mods.find((m) => m.title === "NODRAW Doc")!;
  check("the deck got a designed SVG picture", !!deck.image_path && deck.image_path.endsWith(".svg"));
  const stored = deck.image_path ? ((await readFile(deck.image_path)) ?? Buffer.from("")).toString("utf8") : "";
  check("the stored picture is the sanitised SVG", stored.startsWith("<svg") && stored.includes("<circle"));
  check("the exercise sheet is not illustrated", !ex.image_path);
  check("a failed drawing leaves the default picture, not a failed job", !nodraw.image_path);
  check("modules get study minutes", mods.every((m) => m.study_minutes > 0), mods.map((m) => m.study_minutes).join(","));

  // Course picture + regenerate
  const ok = await illustrateCourse(course.id, { timeoutMs: 1000, drawer });
  const after = (await Courses.byId(course.id))!;
  check("illustrateCourse sets the cover", ok && !!after.cover_image_path?.endsWith(".svg"));
  const old = after.cover_image_path;
  await illustrateCourse(course.id, { timeoutMs: 1000, drawer });
  const again = (await Courses.byId(course.id))!;
  check("regenerating replaces the cover", again.cover_image_path !== old);

  // academy-level switches
  await Academies.setEnabledCourseTypes(academy.id, ["SELF_PACED", "CERTIFICATION"]);
  const a2 = (await Academies.byId(academy.id))!;
  check("setEnabledCourseTypes stores the list", a2.enabled_course_types === "SELF_PACED,CERTIFICATION" && !T.isTypeEnabled(a2.enabled_course_types, "INSTRUCTOR_LED"));
  await Academies.setEnabledCourseTypes(academy.id, [...T.COURSE_TYPES]);

  // stats
  const stats = await Modules.statsByCourses([course.id]);
  check("statsByCourses counts modules and minutes", stats[course.id]?.count === 3 && stats[course.id].minutes > 0, JSON.stringify(stats));
  check("drawer was called for the deck, the document and (via illustrateCourse) the course", drawn >= 4, String(drawn));
} finally {
  for (const id of created) {
    try { await Courses.remove(id); } catch { /* module ids */ }
  }
}
}

main().then(() => {
  console.log(failures ? `${failures} check(s) FAILED.` : "All checks passed.");
  process.exit(failures ? 1 : 0);
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
