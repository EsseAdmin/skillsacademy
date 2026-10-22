// Integration test for the queued AI module builds (lib/aiBuildJobs.ts):
// the plan structure saves at once, each module is built in its own short
// step, claims are atomic and tenant-scoped, failures are retryable, and a
// step never runs past its time budget. The Anthropic call is faked.
//
//   DATABASE_URL=postgres://… npx tsx scripts/ai-build-jobs-test.ts
import { ensureSeed } from "../lib/seed";
import { Academies, Users, Modules, Courses } from "../lib/queries";
import { exec } from "../lib/db";
import { queueAcademyPlan } from "../lib/aiAcademyPlan";
import { runBuildStep, buildProgress, retryFailedJobs } from "../lib/aiBuildJobs";
import type { AcademyPlan } from "../lib/ai";
import type { ContentProvider } from "../lib/aiModuleBuild";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail ? " :: " + detail : ""}`);
}

let DELAY_MS = 0;
let calls = 0;
const fake: ContentProvider = {
  async slides(ctx) {
    calls++;
    await new Promise((r) => setTimeout(r, DELAY_MS));
    if (ctx.moduleTitle.includes("BOOM")) throw new Error("simulated AI failure");
    return { deckTitle: ctx.moduleTitle, slides: [{ title: "Intro", bullets: ["One", "Two"], notes: "" }] };
  },
  async document(ctx) {
    calls++;
    return { title: ctx.moduleTitle, intro: "i", sections: [{ heading: "H", paragraphs: ["p"], bullets: [] }] };
  },
  async exercises(ctx) {
    calls++;
    await new Promise((r) => setTimeout(r, DELAY_MS));
    return { title: `Ex ${ctx.moduleTitle}`, intro: "i", sections: [{ heading: "Exercise 1", paragraphs: ["t"], bullets: [] }] };
  },
  async scorm(ctx) {
    calls++;
    return { title: ctx.moduleTitle, pages: [{ heading: "P", paragraphs: ["x"], bullets: [] }], questions: [{ question: "Q?", options: ["A", "B"], correctIndex: 0, explanation: "e" }], passMarkPct: 70 };
  },
  async videoBrief(ctx) {
    calls++;
    return { script: `S ${ctx.moduleTitle}`, durationMinutes: 3 };
  },
};

const plan: AcademyPlan = {
  academyName: "Q Academy",
  slugSuggestion: "q",
  heroHeadline: "Hi",
  heroTagline: "Tag",
  aboutText: "About",
    learningOutcomes: [],
  template: { name: "QT", description: "d", primary_color: "#0B1F3B", secondary_color: "#1E3A5F", accent_color: "#F59E0B", font_heading: "Inter" },
  homepageBlocks: [{ block_type: "TEXT", title: "Block", body_text: "Body" }],
  courses: [
    { title: "Q Course A", description: "d", category: "x", modules: [
      { title: "Deck One", description: "d", kind: "SLIDES", exercises: true },
      { title: "Plain Text", description: "d", kind: "TEXT" },
      { title: "BOOM Deck", description: "d", kind: "SLIDES" },
    ] },
    { title: "Q Course B", description: "d", category: "x", modules: [
      { title: "Doc Two", description: "d", kind: "DOCUMENT" },
      { title: "Link", description: "d", kind: "URL" },
    ] },
  ],
};

async function main() {
  await ensureSeed();
  const academy = (await Academies.bySlug("brightwave"))!;
  const admin = (await Users.listByAcademy(academy.id, "ACADEMY_ADMIN"))[0];
  const others = (await Academies.all()).filter((a) => a.id !== academy.id);
  const created: string[] = [];
  try {
    const t0 = Date.now();
    const q = await queueAcademyPlan({ academyId: academy.id, createdByUserId: admin.id, plan, switchTemplate: false });
    const queueMs = Date.now() - t0;
    const courses = (await Courses.listByAcademy(academy.id)).filter((c) => c.title.startsWith("Q Course"));
    courses.forEach((c) => created.push(c.id));
    check("Queueing saves the courses and homepage block immediately, with no AI call", q.courseCount === 2 && q.blockCount === 1 && q.jobCount === 5 && calls === 0, JSON.stringify(q));
    check("Queueing is fast", queueMs < 2000, `${queueMs}ms`);
    check("No modules exist yet", (await Promise.all(courses.map((c) => Modules.listByCourse(c.id)))).every((m) => m.length === 0));
    const p = await buildProgress(academy.id);
    check("Progress starts at 0 of 5", p.total === 5 && p.done === 0 && p.pending === 5, JSON.stringify(p));

    // Step 1: the first deck (+ exercises); the plain-text module needs no AI so it shares the step,
    // but the next AI module (BOOM Deck) waits for its own step.
    DELAY_MS = 150;
    const s1 = await runBuildStep(academy.id, { provider: fake });
    check("Step 1 builds the deck (+ exercises) and the cheap text module, then stops before the next AI one", s1.ranJobs === 2 && s1.done === 2 && s1.pending === 3 && calls === 2, JSON.stringify(s1));
    const s2 = await runBuildStep(academy.id, { provider: fake });
    check("A failing AI module becomes a text draft, not a failed step", s2.ranJobs === 1 && s2.done === 3 && s2.failed === 0 && s2.fallbackCount >= 1, JSON.stringify(s2));
    const s3 = await runBuildStep(academy.id, { provider: fake });
    check("Step 3 builds the document and the link, and finishes", s3.ranJobs === 2 && s3.done === 5 && s3.pending === 0, JSON.stringify(s3));
    const s6 = await runBuildStep(academy.id, { provider: fake });
    check("A step with nothing queued does nothing", s6.ranJobs === 0 && s6.pending === 0);

    const [mA, mB] = await Promise.all(courses.sort((a, b) => a.title.localeCompare(b.title)).map((c) => Modules.listByCourse(c.id)));
    mA.forEach((m) => created.push(m.id));
    mB.forEach((m) => created.push(m.id));
    check("Course A: deck, its exercises, text, then the failed deck's text draft — in order",
      mA.map((m) => m.title).join("|").startsWith("Deck One|Deck One — Exercises|Plain Text|BOOM Deck"), mA.map((m) => m.title).join("|"));
    check("Course B has its document and link", mB.length === 2, mB.map((m) => m.title).join("|"));

    // Tenant isolation: another academy's step never touches this academy's jobs.
    await queueAcademyPlan({ academyId: academy.id, createdByUserId: admin.id, plan: { ...plan, courses: [plan.courses[1]] }, switchTemplate: false });
    if (others[0]) {
      const o = await runBuildStep(others[0].id, { provider: fake });
      check("Another academy's step doesn't claim this academy's jobs", o.ranJobs === 0);
    }
    // Atomic claim: two concurrent steps never build the same job twice.
    const before = calls;
    const [x, y] = await Promise.all([runBuildStep(academy.id, { provider: fake }), runBuildStep(academy.id, { provider: fake })]);
    check("Two concurrent steps split the work (each job built once)", x.ranJobs + y.ranJobs === 2 && calls - before === 1, `${x.ranJobs}+${y.ranJobs}, ${calls - before} AI calls`);
    const latest = await Courses.listByAcademy(academy.id);
    latest.filter((c) => c.title.startsWith("Q Course")).forEach((c) => created.push(c.id));

    // Failure + retry: a job whose course vanished fails; retry re-queues it.
    await queueAcademyPlan({ academyId: academy.id, createdByUserId: admin.id, plan: { ...plan, courses: [plan.courses[1]] }, switchTemplate: false });
    await exec("UPDATE ai_build_jobs SET payload_json = 'not json' WHERE id = (SELECT id FROM ai_build_jobs WHERE academy_id=$1 AND status='PENDING' ORDER BY seq LIMIT 1)", [academy.id]);
    const f = await runBuildStep(academy.id, { provider: fake });
    check("A broken job is marked failed and counted", f.failed === 1, JSON.stringify(f));
    await retryFailedJobs(academy.id);
    const rp = await buildProgress(academy.id);
    check("Retry puts failed jobs back in the queue", rp.failed === 0 && rp.pending >= 1, JSON.stringify(rp));

    // A step stuck in RUNNING (dropped request) is picked up again after a minute.
    await exec("UPDATE ai_build_jobs SET status='RUNNING', started_at=$2 WHERE academy_id=$1 AND status='PENDING'", [academy.id, new Date(Date.now() - 120_000).toISOString()]);
    const st = await runBuildStep(academy.id, { provider: fake });
    check("A stale RUNNING job is reclaimed", st.ranJobs >= 1);

    // Budget: a step that is out of time still finishes by falling back, quickly.
    await queueAcademyPlan({ academyId: academy.id, createdByUserId: admin.id, plan: { ...plan, courses: [{ ...plan.courses[0], modules: [plan.courses[0].modules[0]] }] }, switchTemplate: false });
    DELAY_MS = 5000;
    const tb = Date.now();
    const sb = await runBuildStep(academy.id, { provider: fake, budgetMs: 1000 });
    const took = Date.now() - tb;
    check("A step with a tiny budget stops waiting on the AI and still completes", sb.pending === 0 && took < 4000, `${took}ms ${JSON.stringify(sb)}`);
    const last = await Courses.listByAcademy(academy.id);
    last.filter((c) => c.title.startsWith("Q Course")).forEach((c) => created.push(c.id));
  } finally {
    const all = await Courses.listByAcademy(academy.id);
    for (const c of all.filter((c) => c.title.startsWith("Q Course"))) {
      const mods = await Modules.listByCourse(c.id);
      for (const m of mods) await exec("DELETE FROM modules WHERE id=$1", [m.id]);
      await exec("DELETE FROM courses WHERE id=$1", [c.id]);
    }
    await exec("DELETE FROM ai_build_jobs WHERE academy_id=$1", [academy.id]);
    await exec("DELETE FROM website_blocks WHERE academy_id=$1 AND title='Block'", [academy.id]).catch(() => {});
    await exec("DELETE FROM templates WHERE name='QT'").catch(() => {});
  }
  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
