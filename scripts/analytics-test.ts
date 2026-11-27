// Tests for pass 41: engagement analytics (overview, per-course drop-off, modules, learners, CSV, weekly digest).
//   DATABASE_URL=postgres://… npx tsx scripts/analytics-test.ts
import { ensureSeed } from "../lib/seed";
import { Academies, Users, Courses, Modules, Enrollments } from "../lib/queries";
import { exec, queryOne, newId } from "../lib/db";
import { overview, courseStats, courseFunnel, courseLearners, moduleStats, learnerStats, activitySeries, csvCell, toCsv, rangeFrom, parseRange, inactiveCutoff } from "../lib/analytics";
import { buildDigest, sendWeeklyDigests } from "../lib/analyticsDigest";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail ? " :: " + detail : ""}`);
}
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

async function main() {
  await ensureSeed();
  const bw = (await Academies.bySlug("brightwave"))!;
  const rv = (await Academies.bySlug("riverside"))!;
  const admin = (await Users.listByAcademy(bw.id, "ACADEMY_ADMIN"))[0];

  // ---- helpers ----
  check("range parsing falls back to 30 days", parseRange("bogus") === "30d" && parseRange("7d") === "7d" && parseRange(undefined) === "30d");
  check("'all time' starts at the beginning of time", rangeFrom("all") === "" && "2000-01-01T00:00:00.000Z" >= rangeFrom("all"));
  check("CSV cells that look like formulas are defused", csvCell("=SUM(A1)") === "'=SUM(A1)" && csvCell("+1") === "'+1" && csvCell("@x") === "'@x" && csvCell(-5) === "-5");
  check("CSV quotes commas, quotes and newlines", csvCell('a,"b"') === '"a,""b"""' && csvCell("x\ny") === '"x\ny"');
  check("toCsv writes a BOM and CRLF rows", toCsv(["a", "b"], [[1, "x"]]) === "﻿a,b\r\n1,x\r\n");

  // ---- fixture: one course, 3 modules, 4 learners ----
  const course = await Courses.create({ academy_id: bw.id, created_by: admin.id, title: "Analytics course", description: "d", category: "x", price_pence: 0, cover_emoji: "📈" });
  const mods = [];
  for (const [i, title] of ["Intro", "Middle", "Finish"].entries()) {
    const m = await Modules.create({ academy_id: bw.id, created_by: admin.id, title: `An ${title}`, description: "", content_type: "TEXT", content_text: "x" });
    await Modules.assignToCourse(course.id, m.id, i);
    mods.push(m);
  }
  const mk = async (name: string) => Users.create({ academy_id: bw.id, name, email: `${name.toLowerCase()}@an.example`, password_hash: "x", role: "LEARNER" });
  const [ann, bob, cat, dan] = [await mk("Ann"), await mk("Bob"), await mk("Cat"), await mk("Dan")];
  const enrol = async (u: { id: string }, daysOld: number, progress: number, status = "active") => {
    const e = await Enrollments.create({ academy_id: bw.id, course_id: course.id, learner_id: u.id, payment_status: "free" });
    await exec("UPDATE enrollments SET enrolled_at = $1, progress_pct = $2, status = $3 WHERE id = $4", [daysAgo(daysOld), progress, status, e.id]);
    return e;
  };
  const done = (enrolId: string, moduleId: string, daysOld: number) =>
    exec("INSERT INTO module_completions (id, enrollment_id, module_id, completed_at) VALUES ($1,$2,$3,$4)", [newId(), enrolId, moduleId, daysAgo(daysOld)]);
  const eAnn = await enrol(ann, 40, 100, "completed"); // finished everything 2 days ago
  for (const [i, m] of mods.entries()) await done(eAnn.id, m.id, 5 - i * 1.5);
  const eBob = await enrol(bob, 30, 33); // did the first module 25 days ago, then nothing -> inactive
  await done(eBob.id, mods[0].id, 25);
  const eCat = await enrol(cat, 3, 33); // started 3 days ago, did first module yesterday -> active
  await done(eCat.id, mods[0].id, 1);
  void dan; // no enrolment -> "not started"

  // a quiz on the middle module
  const quizId = newId();
  await exec("INSERT INTO quizzes (id, academy_id, module_id, course_id, created_by, title, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,'Q',$6,$6)", [quizId, bw.id, mods[1].id, course.id, admin.id, daysAgo(40)]);
  await exec("INSERT INTO quiz_attempts (id, quiz_id, learner_id, enrollment_id, started_at, submitted_at, score_pct, passed) VALUES ($1,$2,$3,$4,$5,$5,90,1)", [newId(), quizId, ann.id, eAnn.id, daysAgo(3)]);
  await exec("INSERT INTO quiz_attempts (id, quiz_id, learner_id, enrollment_id, started_at, submitted_at, score_pct, passed) VALUES ($1,$2,$3,$4,$5,$5,40,0)", [newId(), quizId, cat.id, eCat.id, daysAgo(1)]);

  // ---- funnel ----
  const funnel = await courseFunnel(bw.id, course.id);
  check("funnel lists modules in course order", funnel.map((f) => f.title).join() === "An Intro,An Middle,An Finish");
  check("funnel counts completions per module (3, 1, 1 of 3 learners)", funnel.map((f) => `${f.completed}/${f.reached}`).join() === "3/3,1/3,1/3", funnel.map((f) => `${f.completed}/${f.reached}`).join());
  check("quiz stats appear on the quiz module only", funnel[1].attempts === 2 && funnel[1].avgScore === 65 && funnel[1].passRate === 50 && funnel[0].attempts === null);

  // ---- course report ----
  const cs = (await courseStats(bw.id, rangeFrom("30d"))).find((c) => c.id === course.id)!;
  check("course: enrolled / finished / avg progress", cs.enrolled === 3 && cs.completed === 1 && cs.avgProgress === 55 && cs.modules === 3, JSON.stringify(cs));
  check("course: new enrolments follow the range (Bob enrolled 30 days ago is on the edge, Ann 40 days ago is out)", cs.newEnrolments >= 1 && cs.newEnrolments <= 2);
  check("course: stalled = unfinished + quiet for 14+ days (only Bob)", cs.stalled === 1, String(cs.stalled));
  check("course: quiz average in range", cs.avgQuizScore === 65);
  const cl = await courseLearners(bw.id, course.id);
  check("course learners: newest activity first, with last-active dates", cl.length === 3 && cl[0].name === "Ann" || cl[0].name === "Cat");

  // ---- overview ----
  const o30 = await overview(bw.id, rangeFrom("30d"));
  check("overview counts quiz attempts and pass rate in range", o30.quizAttempts >= 2 && o30.quizPassRate !== null);
  check("overview: Bob is among the learners who have gone quiet", o30.inactiveLearners >= 1);
  const o7 = await overview(bw.id, rangeFrom("7d"));
  check("a shorter range never shows more activity", o7.moduleCompletions <= o30.moduleCompletions && o7.enrolmentsNew <= o30.enrolmentsNew && o7.activeLearners <= o30.activeLearners);
  check("Cat and Ann count as active this week, Bob does not", o7.activeLearners >= 2);

  // ---- series ----
  const series = await activitySeries(bw.id, "30d");
  check("series is daily for 30 days, gaps filled", series.unit === "day" && series.points.length >= 30 && series.points.length <= 32);
  check("series totals match the overview", series.points.reduce((s, p) => s + p.completions, 0) === o30.moduleCompletions);
  const yearly = await activitySeries(bw.id, "365d");
  check("a year is weekly", yearly.unit === "week" && yearly.points.length >= 52 && yearly.points.length <= 54);

  // ---- modules ----
  const ms = await moduleStats(bw.id, rangeFrom("30d"), { sort: "attention", q: "An ", limit: 10, offset: 0 });
  check("modules search narrows the list", ms.total === 3 && ms.rows.every((r) => r.title.startsWith("An ")));
  check("'needs attention' puts the lowest completion rate first", ms.rows[0].title !== "An Intro" && ms.rows[ms.rows.length - 1].title === "An Intro", ms.rows.map((r) => r.title).join());
  const popular = await moduleStats(bw.id, rangeFrom("30d"), { sort: "popular", q: "An ", limit: 1, offset: 0 });
  check("'most completed' leads with the intro, and paging works", popular.rows[0].title === "An Intro" && popular.rows.length === 1 && popular.total === 3);
  const wild = await moduleStats(bw.id, "", { sort: "attention", q: "%", limit: 10, offset: 0 });
  check("a % in a search is literal, not a wildcard", wild.total === 0);

  // ---- learners ----
  const ls = await learnerStats(bw.id, { q: "@an.example", limit: 50, offset: 0 });
  const st = Object.fromEntries(ls.rows.map((r) => [r.name, r.state]));
  check("learner states: Ann finished, Bob inactive, Cat active, Dan not started", st.Ann === "finished" && st.Bob === "inactive" && st.Cat === "active" && st.Dan === "not_started", JSON.stringify(st));
  check("learners needing attention are listed first", ls.rows[0].name === "Bob");
  const only = await learnerStats(bw.id, { q: "@an.example", state: "inactive", limit: 50, offset: 0 });
  check("state filter + total", only.rows.length === 1 && only.rows[0].name === "Bob" && only.total === 1);
  const paged = await learnerStats(bw.id, { q: "@an.example", limit: 2, offset: 2 });
  check("paging keeps the full total", paged.rows.length === 2 && paged.total === 4);

  // ---- tenant isolation ----
  const other = await courseStats(rv.id, rangeFrom("all"));
  check("another academy sees none of these courses", !other.some((c) => c.id === course.id));
  check("another academy's funnel for this course is empty", (await courseFunnel(rv.id, course.id)).length === 0);
  check("another academy's learner list excludes them", !(await learnerStats(rv.id, { q: "@an.example", limit: 50, offset: 0 })).rows.length);
  check("cutoff is 14 days ago", Math.abs(Date.now() - 14 * 86_400_000 - new Date(inactiveCutoff()).getTime()) < 5000);

  // ---- digest ----
  const mail = buildDigest("Brightwave <Academy>", "https://x.example/a/brightwave/admin/analytics", o7, [cs]);
  check("digest has a subject, text and html", mail.subject.includes("Brightwave") && mail.text.includes("https://x.example/a/brightwave/admin/analytics") && mail.html.includes("Open your analytics"));
  check("digest html escapes the academy name", mail.html.includes("&lt;Academy&gt;") && !mail.html.includes("<Academy>"));
  check("digest names stalled courses", mail.text.includes("Analytics course"));
  const run1 = await sendWeeklyDigests("https://x.example");
  const sentAt = (await queryOne<{ analytics_digest_sent_at: string | null }>("SELECT analytics_digest_sent_at FROM academies WHERE id = $1", [bw.id]))!.analytics_digest_sent_at;
  check("the weekly run claims each academy that has learners", run1.academies >= 1 && !!sentAt);
  const run2 = await sendWeeklyDigests("https://x.example");
  check("running it again straight away sends nothing (no double emails)", run2.academies === 0);
  await exec("UPDATE academies SET analytics_digest = 0, analytics_digest_sent_at = NULL WHERE id = $1", [bw.id]);
  const run3 = await sendWeeklyDigests("https://x.example");
  const bwAgain = await queryOne<{ analytics_digest_sent_at: string | null }>("SELECT analytics_digest_sent_at FROM academies WHERE id = $1", [bw.id]);
  check("an academy that switched the email off is skipped", bwAgain!.analytics_digest_sent_at === null && run3.academies >= 0);

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
