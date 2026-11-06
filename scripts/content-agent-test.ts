// Tests for the prompt-based content agent (lib/contentAgent.ts): the plan from the
// model is re-validated, only allowed courses are used, links must be typed by the
// person, and every module is built as real content (strict mode) — a failure never
// leaves a placeholder draft behind. The Anthropic calls are faked.
//
//   DATABASE_URL=postgres://… npx tsx scripts/content-agent-test.ts
import { ensureSeed } from "../lib/seed";
import { Academies, Users, Modules, Courses, CourseInstructors } from "../lib/queries";
import { startAgentRequest, sanitizeAgentPlan, MAX_AGENT_COST, ContentAgentError, type AgentPlanner } from "../lib/contentAgent";
import { runBuildStep, buildProgress, retryFailedJobs } from "../lib/aiBuildJobs";
import type { ContentProvider } from "../lib/aiModuleBuild";
import type { SessionPayload } from "../lib/auth";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail ? " :: " + detail : ""}`);
}
function sessionOf(u: { id: string; role: SessionPayload["role"]; academy_id: string | null; name: string; email: string }, slug: string): SessionPayload {
  return { userId: u.id, role: u.role, academyId: u.academy_id, academySlug: slug, name: u.name, email: u.email };
}

let FAIL_TITLE = "";
const instructions: string[] = [];
const calls: string[] = [];
const provider: ContentProvider = {
  async slides(ctx) { calls.push("slides:" + ctx.moduleTitle); if (ctx.moduleTitle.includes(FAIL_TITLE) && FAIL_TITLE) throw new Error("simulated slides failure"); return { deckTitle: ctx.moduleTitle, slides: [{ title: "Intro", bullets: ["a", "b"], notes: "" }] }; },
  async document(ctx) { calls.push("document:" + ctx.moduleTitle); return { title: ctx.moduleTitle, intro: "i", sections: [{ heading: "H", paragraphs: ["p"], bullets: [] }] }; },
  async exercises(ctx) { calls.push("exercises:" + ctx.moduleTitle); if (ctx.moduleTitle.includes("NOEX")) throw new Error("simulated exercises failure"); return { title: ctx.moduleTitle, intro: "i", sections: [{ heading: "E", paragraphs: ["t"], bullets: [] }] }; },
  async scorm(ctx) { calls.push("scorm:" + ctx.moduleTitle); return { title: ctx.moduleTitle, pages: [{ heading: "P", paragraphs: ["x"], bullets: [] }], questions: [{ question: "Q?", options: ["A", "B"], correctIndex: 0, explanation: "e" }], passMarkPct: 70 }; },
  async videoBrief(ctx) { calls.push("video:" + ctx.moduleTitle); return { script: `Script for ${ctx.moduleTitle}`, durationMinutes: 4 }; },
  async text(ctx) { calls.push("text:" + ctx.moduleTitle); instructions.push(ctx.instruction ?? ""); return { title: ctx.moduleTitle, description: "d", content: `A full written lesson about ${ctx.moduleTitle}.\n\nSection one...` }; },
};

async function main() {
  // ---- sanitiser (pure) ----
  const courses = [{ id: "c1", title: "Fire Safety", description: "" }, { id: "c2", title: "Manual Handling", description: "" }];
  const prompt = "For Fire Safety make a deck, see https://example.com/guide.";
  const good = sanitizeAgentPlan(
    { courseId: "c1", modules: [
      { title: "Evacuation", kind: "SLIDES", description: "How to evacuate", exercises: true },
      { title: "Quiz", kind: "SCORM", description: "q" },
      { title: "Guide link", kind: "URL", description: "l", url: "https://example.com/guide" },
      { title: "Made-up link", kind: "URL", description: "l", url: "https://evil.example/x" },
      { title: "Video", kind: "VIDEO", description: "v", url: "https://evil.example/v" },
      { title: "Weird", kind: "HOLOGRAM", description: "w" },
      { kind: "TEXT", description: "no title" },
    ] },
    { prompt, courses }
  );
  check("the course is taken from the model when it is one of the allowed courses", good.courseId === "c1");
  check("a deck can carry a Word exercise sheet", good.modules[0].kind === "SLIDES" && good.modules[0].exercises === true);
  check("a link the person typed is kept", good.modules.find((m) => m.title === "Guide link")?.url === "https://example.com/guide");
  check("a link the person never typed is dropped; a URL module without a link is left out with a note", !good.modules.some((m) => m.title === "Made-up link") && good.notes.some((n) => n.includes("Made-up link")));
  check("a video with an invented link becomes a script (no url)", good.modules.find((m) => m.title === "Video")?.url === undefined);
  check("unknown kinds fall back to a written lesson; modules without a title are dropped", good.modules.find((m) => m.title === "Weird")?.kind === "TEXT" && !good.modules.some((m) => !m.title));
  check("an unknown course id is not accepted", sanitizeAgentPlan({ courseId: "other-academy-course", modules: [{ title: "x", kind: "TEXT", description: "d" }] }, { prompt, courses }).courseId === null);
  check("a course can be matched by its title", sanitizeAgentPlan({ courseId: "fire safety", modules: [{ title: "x", kind: "TEXT", description: "d" }] }, { prompt, courses }).courseId === "c1");
  check("the course picked in the form wins over the model's guess", sanitizeAgentPlan({ courseId: "c1", modules: [{ title: "x", kind: "TEXT", description: "d" }] }, { prompt, courses, chosenCourseId: "c2" }).courseId === "c2");
  check("a chosen course the person may not use is ignored", sanitizeAgentPlan({ modules: [{ title: "x", kind: "TEXT", description: "d" }] }, { prompt, courses, chosenCourseId: "zzz" }).courseId === null);
  const noCourse = sanitizeAgentPlan({ modules: [{ title: "x", kind: "TEXT", description: "d" }] }, { prompt, courses });
  check("no course = the agent asks which one", !!noCourse.question && noCourse.courseId === null);
  const many = sanitizeAgentPlan({ courseId: "c1", modules: Array.from({ length: 12 }, (_, i) => ({ title: `S${i}`, kind: "SLIDES", description: "d", exercises: true })) }, { prompt, courses });
  const cost = many.modules.reduce((n, m) => n + (m.exercises ? 2 : 1), 0);
  check(`one request is capped at ${MAX_AGENT_COST} generated files`, cost <= MAX_AGENT_COST && many.modules.length >= 3 && many.notes.length > 0, `cost=${cost}, modules=${many.modules.length}`);

  // ---- startAgentRequest (database) ----
  await ensureSeed();
  const A = (await Academies.bySlug("brightwave"))!;
  const B = (await Academies.bySlug("riverside"))!;
  const adminA = sessionOf((await Users.byAcademyAndEmail(A.id, "admin@brightwave.example"))!, "brightwave");
  const instrA = sessionOf((await Users.byAcademyAndEmail(A.id, "instructor@brightwave.example"))!, "brightwave");
  const learnerA = sessionOf((await Users.byAcademyAndEmail(A.id, "learner@brightwave.example"))!, "brightwave");
  const adminB = sessionOf((await Users.byAcademyAndEmail(B.id, "admin@riverside.example"))!, "riverside");
  const created: string[] = [];
  const mine = await Courses.create({ academy_id: A.id, created_by: adminA.userId, title: "Agent Target Course", description: "d", category: "x", price_pence: 0, cover_emoji: "📘" });
  const other = await Courses.create({ academy_id: A.id, created_by: adminA.userId, title: "Not The Instructors Course", description: "d", category: "x", price_pence: 0, cover_emoji: "📘" });
  const bCourse = (await Courses.listByAcademy(B.id))[0];
  created.push(mine.id, other.id);
  await CourseInstructors.assign(mine.id, instrA.userId);

  let planInput: Parameters<AgentPlanner>[0] | null = null;
  const planner = (modules: unknown[], courseId?: string): AgentPlanner => async (input) => { planInput = input; return { courseId: courseId ?? mine.id, modules }; };
  try {
    // refuse junk
    let e1 = "";
    try { await startAgentRequest(adminA, { prompt: "hi", planner: planner([]) }); } catch (e) { e1 = (e as Error).message; }
    check("a too-short prompt is refused with a helpful message", /Tell the agent/.test(e1));
    let e2: unknown = null;
    try { await startAgentRequest(learnerA, { prompt: "make a deck for the course please", planner: planner([]) }); } catch (e) { e2 = e; }
    check("a learner (no courses of their own) can't use the agent", e2 instanceof ContentAgentError);

    // admin: plan + queue
    const r = await startAgentRequest(adminA, {
      prompt: "Add a deck with exercises, a handout and a written lesson on evacuation to Agent Target Course",
      planner: planner([
        { title: "Evacuation deck", kind: "SLIDES", description: "Brief", exercises: true },
        { title: "Evacuation handout", kind: "DOCUMENT", description: "Brief" },
        { title: "Evacuation lesson", kind: "TEXT", description: "Short learner line", brief: "BRIEF-XYZ write for night-shift staff" },
        { title: "Evacuation quiz", kind: "SCORM", description: "Brief" },
      ]),
    });
    check("the request is planned and queued", r.jobCount === 4 && r.courseId === mine.id && r.planned.length === 4, JSON.stringify({ jobs: r.jobCount, course: r.courseTitle }));
    check("the planner only sees courses this person may use", planInput!.courses.some((c) => c.id === mine.id) && !planInput!.courses.some((c) => c.id === bCourse.id));
    check("nothing is created until the build steps run", (await Modules.listByCourse(mine.id)).length === 0 && (await buildProgress(A.id)).pending === 4);

    // run steps with the fake provider (no drawer / no AI key → no picture jobs)
    let guard = 0;
    for (; guard < 10; guard++) {
      const s = await runBuildStep(A.id, { provider, budgetMs: 15000 });
      if (s.ranJobs === 0) break;
    }
    const prog = await buildProgress(A.id);
    const mods = await Modules.listByCourse(mine.id);
    mods.forEach((m) => created.push(m.id));
    check("all four modules were built and none failed", prog.pending === 0 && prog.failed === 0, JSON.stringify(prog));
    check("modules in the course: deck, its exercise sheet, handout, lesson, quiz — in order",
      mods.map((m) => m.title).join("|") === "Evacuation deck|Evacuation deck — Exercises|Evacuation handout|Evacuation lesson|Evacuation quiz", mods.map((m) => m.title).join("|"));
    const lesson = mods.find((m) => m.title === "Evacuation lesson")!;
    check("a written lesson holds the full lesson, not an outline", lesson.content_type === "TEXT" && /full written lesson/.test(lesson.content_text ?? "") && !/Draft outline/.test(lesson.content_text ?? ""));
    check("files and the SCORM package are real modules", mods.filter((m) => m.content_type === "FILE").length === 3 && mods.some((m) => m.content_type === "SCORM"));
    check("the writing brief reaches the writer, and the learner-facing description stays short", instructions.some((i) => i.includes("BRIEF-XYZ")) && lesson.description === "Short learner line");
    check("modules carry study minutes", mods.every((m) => m.study_minutes > 0));

    // a second request appends after the existing modules
    const r2 = await startAgentRequest(adminA, { prompt: "One more video script for Agent Target Course please", planner: planner([{ title: "Video one", kind: "VIDEO", description: "Brief" }]) });
    await runBuildStep(A.id, { provider, budgetMs: 15000 });
    const after = await Modules.listByCourse(mine.id);
    after.forEach((m) => created.push(m.id));
    check("a second request adds to the end of the course", r2.jobCount === 1 && after[after.length - 1].title === "Video one" && after.length === mods.length + 1);
    check("a video without a link gets a script to record", /Script for Video one/.test(after[after.length - 1].content_text ?? ""));

    // strict failure: no placeholder, job FAILED with a friendly message, retry works
    FAIL_TITLE = "BOOM";
    const before = (await Modules.listByCourse(mine.id)).length;
    await startAgentRequest(adminA, { prompt: "A deck BOOM for Agent Target Course", planner: planner([{ title: "BOOM deck", kind: "SLIDES", description: "Brief" }]) });
    await runBuildStep(A.id, { provider, budgetMs: 15000 });
    const pf = await buildProgress(A.id);
    check("a failed generation leaves NO placeholder draft in the course", (await Modules.listByCourse(mine.id)).length === before);
    check("…the job is failed with a plain-language reason", pf.failed === 1 && pf.failures.length === 1 && !/simulated/.test(pf.failures[0]) && /Try again/.test(pf.failures[0]), JSON.stringify(pf.failures));
    FAIL_TITLE = "";
    await retryFailedJobs(A.id);
    await runBuildStep(A.id, { provider, budgetMs: 15000 });
    const retried = await Modules.listByCourse(mine.id);
    retried.forEach((m) => created.push(m.id));
    check("after Try again the deck is built", (await buildProgress(A.id)).failed === 0 && retried.some((m) => m.title === "BOOM deck"));

    // exercises failing is all-or-nothing in strict mode
    const n0 = (await Modules.listByCourse(mine.id)).length;
    await startAgentRequest(adminA, { prompt: "A deck with exercises NOEX for Agent Target Course", planner: planner([{ title: "NOEX deck", kind: "SLIDES", description: "Brief", exercises: true }]) });
    await runBuildStep(A.id, { provider, budgetMs: 15000 });
    check("if the exercise sheet fails, the deck is not left behind either", (await Modules.listByCourse(mine.id)).length === n0 && (await buildProgress(A.id)).failed === 1);
    await retryFailedJobs(A.id);
    await runBuildStep(A.id, { provider, budgetMs: 15000 }); // fails again (still NOEX) — then clear it
    const { exec } = await import("../lib/db");
    await exec("DELETE FROM ai_build_jobs WHERE academy_id = $1 AND status = 'FAILED'", [A.id]);

    // instructor limits
    const ri = await startAgentRequest(instrA, { prompt: "A written lesson for Agent Target Course about teamwork", planner: planner([{ title: "Teamwork lesson", kind: "TEXT", description: "Brief" }]) });
    check("an instructor can add modules to a course they teach", ri.jobCount === 1 && ri.courseId === mine.id);
    check("…and the agent only offers them their own courses", planInput!.courses.some((c) => c.id === mine.id) && !planInput!.courses.some((c) => c.id === other.id));
    // a course they do NOT teach: chosen in the form
    let e3: unknown = null;
    try { await startAgentRequest(instrA, { prompt: "A written lesson for another course", courseId: other.id, planner: planner([{ title: "Nope", kind: "TEXT", description: "d" }], other.id) }); } catch (e) { e3 = e; }
    check("an instructor can't target a course they don't teach", e3 instanceof ContentAgentError);
    // the model guessing a course outside the allowed list → a question, nothing queued
    const rq = await startAgentRequest(instrA, { prompt: "A written lesson for the other course please", planner: planner([{ title: "Nope", kind: "TEXT", description: "d" }], other.id) });
    check("a course outside the allowed list is never used; the agent asks instead", !!rq.question && rq.jobCount === 0);
    await runBuildStep(A.id, { provider, budgetMs: 15000 });
    (await Modules.listByCourse(mine.id)).forEach((m) => created.push(m.id));

    // another academy
    let e4: unknown = null;
    try { await startAgentRequest(adminB, { prompt: "A written lesson for the Fire course", courseId: mine.id, planner: planner([{ title: "x", kind: "TEXT", description: "d" }]) }); } catch (e) { e4 = e; }
    check("an admin of another academy can't add modules to this academy's course", e4 instanceof ContentAgentError);
    const rb = await startAgentRequest(adminB, { prompt: "A written lesson for the course about safety please", planner: async (i) => ({ courseId: mine.id, modules: [{ title: "x", kind: "TEXT", description: "d" }], seen: i.courses.length }) });
    check("…and a guessed course id from another academy is refused", !!rb.question && rb.jobCount === 0 && (await Modules.listByCourse(mine.id)).every((m) => m.academy_id === A.id));
    check("calls were made for the exercise sheet and the quiz", calls.some((c) => c.startsWith("exercises:")) && calls.some((c) => c.startsWith("scorm:")));
  } finally {
    const { exec } = await import("../lib/db");
    await exec("DELETE FROM ai_build_jobs WHERE academy_id = ANY($1::text[])", [[A.id, B.id]]);
    for (const id of created) {
      try { await Courses.remove(id); } catch { /* a module id */ }
    }
    for (const id of created) {
      try { await Modules.remove(id); } catch { /* already gone */ }
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
