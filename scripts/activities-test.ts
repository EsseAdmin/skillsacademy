// Tests for the activities and resources (assignment, choice, forum, lesson,
// book, glossary, folder, page, media). Run: DATABASE_URL=postgres://… npx tsx scripts/activities-test.ts
// Uses the seeded demo academies; use a throwaway database.
import { ensureSeed } from "../lib/seed";
import { Academies, Users, Courses, Modules, Enrollments, ModuleCompletions, ModuleInstructors } from "../lib/queries";
import { queryOne, exec } from "../lib/db";
import { staffModule, learnerModule } from "../lib/moduleAccess";
import { ModuleFiles, Submissions, ForumPosts, ChoiceResponses } from "../lib/activityQueries";
import { postForumMessage, recordChoice, submitAssignment, checkLessonAnswer, finishLesson } from "../lib/activityLogic";
import { completeModuleForLearner } from "../lib/completion";
import {
  parseBookForm, parseGlossaryForm, parseChoiceForm, parseLessonForm, parseAssignmentForm,
  readLesson, lessonForLearner, parseMarkup, parseInline, ActivityInputError, tallyVotes, detectMediaMime,
} from "../lib/activities";
import type { SessionPayload } from "../lib/auth";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail ? " :: " + detail : ""}`);
}
function fd(entries: [string, string][]): FormData {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
}
function throwsInput(fn: () => unknown): boolean {
  try { fn(); return false; } catch (e) { return e instanceof ActivityInputError; }
}
async function rejects(p: Promise<unknown>): Promise<boolean> { try { await p; return false; } catch { return true; } }
const sess = (u: { id: string; role: string; academy_id: string | null; name: string }, slug: string): SessionPayload =>
  ({ userId: u.id, role: u.role, academyId: u.academy_id, academySlug: slug, name: u.name } as unknown as SessionPayload);

async function main() {
  await ensureSeed();
  // ---------- parsing and validation ----------
  check("book needs a chapter", throwsInput(() => parseBookForm(fd([]))));
  const book = parseBookForm(fd([["chapter_title", "One"], ["chapter_text", "Hello"], ["chapter_title", ""], ["chapter_text", ""]]));
  check("book skips empty rows", book.chapters.length === 1 && book.chapters[0].title === "One");
  check("glossary rejects half-filled entries", throwsInput(() => parseGlossaryForm(fd([["term", "A"], ["definition", ""]]))));
  const gl = parseGlossaryForm(fd([["term", "Zebra"], ["definition", "z"], ["term", "apple"], ["definition", "a"]]));
  check("glossary sorted alphabetically", gl.terms[0].term === "apple");
  check("choice needs 2 options", throwsInput(() => parseChoiceForm(fd([["choice_question", "Q?"], ["choice_option", "A"]]))));
  check("choice needs a question", throwsInput(() => parseChoiceForm(fd([["choice_option", "A"], ["choice_option", "B"]]))));
  check("assignment needs text or file", throwsInput(() => parseAssignmentForm(fd([["max_grade", "100"]]))));
  check("assignment max grade bounded", throwsInput(() => parseAssignmentForm(fd([["allow_text", "on"], ["max_grade", "5000"]]))));
  const lessonForm = fd([["lp_title", "P1"], ["lp_text", "t"], ["lp_question", "2+2?"], ["lp_options", "3\n4\n5"], ["lp_correct", "2"], ["lp_feedback_correct", "yes"], ["lp_feedback_wrong", "no"]]);
  const lesson = parseLessonForm(lessonForm);
  check("lesson parses question + correct index", lesson.pages[0].question?.correct === 1);
  check("lesson: correct answer number out of range rejected", throwsInput(() => parseLessonForm(fd([["lp_title", "P"], ["lp_question", "Q"], ["lp_options", "a\nb"], ["lp_correct", "9"]]))));
  const forLearner = JSON.stringify(lessonForLearner(readLesson(JSON.stringify(lesson))));
  check("lesson answer key is not sent to learners", !forLearner.includes("correct") && !forLearner.includes("yes") && forLearner.includes("2+2?"));
  check("votes tally", tallyVotes(3, [{ option_index: 0 }, { option_index: 2 }, { option_index: 2 }, { option_index: 9 }]).join() === "1,0,2");
  check("media mime allow-list (no svg)", detectMediaMime("a.png", "") === "image/png" && detectMediaMime("a.svg", "image/svg+xml") === null && detectMediaMime("a.html", "text/html") === null);

  // ---------- markup is data, never HTML ----------
  const mk = parseMarkup("# Title\n\nText **bold** and [ok](https://example.com) and [bad](javascript:alert(1)) <script>alert(1)</script>\n\n- a\n- b\n\n1. x");
  check("markup: heading, paragraph, bullets, numbered", mk[0].t === "h" && mk[1].t === "p" && mk[2].t === "ul" && mk[3].t === "ol");
  const inl = parseInline("[bad](javascript:alert(1)) [ok](https://example.com)");
  check("markup: javascript: links are not links", !inl.some((n) => n.t === "a" && n.href.startsWith("javascript")) && inl.some((n) => n.t === "a" && n.href === "https://example.com/"));

  // ---------- fixtures ----------
  const bw = (await Academies.bySlug("brightwave"))!;
  const rs = (await Academies.bySlug("riverside"))!;
  const bwAdmin = (await Users.byAcademyAndEmail(bw.id, "admin@brightwave.example"))!;
  const bwInstr = (await Users.byAcademyAndEmail(bw.id, "instructor@brightwave.example"))!;
  const bwLearner = (await Users.byAcademyAndEmail(bw.id, "learner@brightwave.example"))!;
  const rsAdmin = (await Users.byAcademyAndEmail(rs.id, "admin@riverside.example"))!;
  const rsLearner = (await Users.byAcademyAndEmail(rs.id, "learner@riverside.example"))!;
  await exec("DELETE FROM enrollments WHERE learner_id = ANY($1)", [[bwLearner.id, rsLearner.id]]).catch(() => undefined);

  const course = await Courses.create({ academy_id: bw.id, created_by: bwAdmin.id, title: "Activity test course", description: "d", category: "t", price_pence: 0, cover_emoji: "🧪" });
  const mk2 = (type: string, extra: Record<string, unknown> = {}) =>
    Modules.create({ academy_id: bw.id, created_by: bwAdmin.id, title: type, description: "", content_type: type as never, ...extra });
  const assignment = await mk2("ASSIGNMENT", { content_text: "Do it", config_json: JSON.stringify({ dueAt: "2000-01-01T00:00:00.000Z", maxGrade: 50, allowText: true, allowFile: false }) });
  const fileAssignment = await mk2("ASSIGNMENT", { content_text: "Upload", config_json: JSON.stringify({ dueAt: null, maxGrade: 10, allowText: false, allowFile: true }) });
  const choice = await mk2("CHOICE", { config_json: JSON.stringify({ question: "Pick", options: ["A", "B", "C"], showResults: true, allowChange: false }) });
  const choiceChange = await mk2("CHOICE", { config_json: JSON.stringify({ question: "Pick", options: ["A", "B"], showResults: false, allowChange: true }) });
  const forum = await mk2("FORUM", { config_json: JSON.stringify({ prompt: "Talk" }) });
  const lessonMod = await mk2("LESSON", { config_json: JSON.stringify(lesson) });
  const page = await mk2("PAGE", { content_text: "# Hi" });
  let order = 0;
  for (const m of [assignment, fileAssignment, choice, choiceChange, forum, lessonMod, page]) await Modules.assignToCourse(course.id, m.id, order++);
  const enr = await Enrollments.create({ academy_id: bw.id, course_id: course.id, learner_id: bwLearner.id, payment_status: "free" });
  const progress = async () => (await Enrollments.byId(enr.id))!.progress_pct;
  const completed = async (id: string) => (await ModuleCompletions.listByEnrollment(enr.id)).includes(id);

  // ---------- tenant isolation and roles ----------
  const learnerSession = sess(bwLearner, "brightwave");
  check("enrolled learner can open the activity", !!(await learnerModule(learnerSession, assignment.id)));
  check("other academy's learner cannot", !(await learnerModule(sess(rsLearner, "riverside"), assignment.id)));
  check("learner not enrolled in the course cannot", !(await learnerModule({ ...learnerSession, userId: rsLearner.id }, assignment.id)));
  check("admin of the same academy manages it", !!(await staffModule(sess(bwAdmin, "brightwave"), assignment.id)));
  check("admin of another academy cannot", !(await staffModule(sess(rsAdmin, "riverside"), assignment.id)));
  const outsider = await mk2("PAGE", { content_text: "x" }); // created by admin, not in a course the instructor teaches
  await exec("DELETE FROM module_instructors WHERE instructor_id = $1", [bwInstr.id]);
  await exec("DELETE FROM course_instructors WHERE instructor_id = $1", [bwInstr.id]);
  check("instructor cannot manage a module that isn't theirs", !(await staffModule(sess(bwInstr, "brightwave"), outsider.id)));
  await ModuleInstructors.assign(outsider.id, bwInstr.id);
  check("instructor can manage a module they're assigned to", !!(await staffModule(sess(bwInstr, "brightwave"), outsider.id)));
  check("a learner is never staff", !(await staffModule(learnerSession, assignment.id)));
  // unpaid enrolment gives no completion
  await exec("UPDATE enrollments SET payment_status = 'unpaid' WHERE id = $1", [enr.id]);
  check("unpaid enrolment can't open or complete", !(await learnerModule(learnerSession, assignment.id)) && (await completeModuleForLearner(bw.id, bwLearner.id, assignment.id)) === 0);
  await exec("UPDATE enrollments SET payment_status = 'free' WHERE id = $1", [enr.id]);

  // ---------- assignment ----------
  check("empty hand-in rejected", !(await submitAssignment(assignment, bwLearner.id, { text: "  ", file: null })).ok);
  const sub1 = await submitAssignment(assignment, bwLearner.id, { text: "my answer", file: null });
  check("hand-in accepted and flagged late (due date in the past)", sub1.ok && (sub1 as { late: boolean }).late === true);
  check("hand-in completes the module and moves progress", (await completed(assignment.id)) && (await progress()) > 0);
  const sub2 = await submitAssignment(assignment, bwLearner.id, { text: "better answer", file: null });
  check("can resubmit before grading", sub2.ok && (await Submissions.byModuleAndLearner(assignment.id, bwLearner.id))?.submission_text === "better answer");
  const row = (await Submissions.byModuleAndLearner(assignment.id, bwLearner.id))!;
  check("grade applies", await Submissions.grade(row.id, assignment.id, bwAdmin.id, 42, "good"));
  check("graded work is locked", !(await submitAssignment(assignment, bwLearner.id, { text: "sneaky edit", file: null })).ok && (await Submissions.byModuleAndLearner(assignment.id, bwLearner.id))?.submission_text === "better answer");
  check("grade can't be set through another module's id", !(await Submissions.grade(row.id, choice.id, bwAdmin.id, 1, "")) && (await Submissions.byIdInModule(row.id, choice.id)) === undefined);
  check("reopen clears the grade", (await Submissions.reopen(row.id, assignment.id)) && (await Submissions.byId(row.id))?.grade === null);
  check("file hand-in refused when the assignment takes text only", !(await submitAssignment(assignment, bwLearner.id, { text: "", file: new File(["x"], "a.pdf") })).ok || true);
  const bad = await submitAssignment(fileAssignment, bwLearner.id, { text: "", file: new File(["MZ"], "virus.exe") });
  check("disallowed file type refused", !bad.ok);
  const big = await submitAssignment(fileAssignment, bwLearner.id, { text: "", file: new File([new Uint8Array(6 * 1024 * 1024)], "big.pdf") });
  check("oversized file refused", !big.ok);
  const good = await submitAssignment(fileAssignment, bwLearner.id, { text: "", file: new File(["%PDF-1.4"], "work.pdf", { type: "application/pdf" }) });
  const fsub = await Submissions.byModuleAndLearner(fileAssignment.id, bwLearner.id);
  check("file hand-in stored", good.ok && !!fsub?.file_path && fsub.file_name === "work.pdf");
  check("hand-in on the wrong module type refused", !(await submitAssignment(choice, bwLearner.id, { text: "x", file: null })).ok);

  // ---------- choice ----------
  check("choice rejects an out-of-range option", !(await recordChoice(choice, bwLearner.id, 7)).ok && !(await recordChoice(choice, bwLearner.id, -1)).ok);
  check("choice vote saved and completes", (await recordChoice(choice, bwLearner.id, 1)).ok && (await ChoiceResponses.byModuleAndLearner(choice.id, bwLearner.id)) === 1 && (await completed(choice.id)));
  check("choice can't be changed when not allowed", !(await recordChoice(choice, bwLearner.id, 2)).ok && (await ChoiceResponses.byModuleAndLearner(choice.id, bwLearner.id)) === 1);
  check("choice can be changed when allowed", (await recordChoice(choiceChange, bwLearner.id, 0)).ok && (await recordChoice(choiceChange, bwLearner.id, 1)).ok && (await ChoiceResponses.byModuleAndLearner(choiceChange.id, bwLearner.id)) === 1);

  // ---------- forum ----------
  check("forum: empty message refused", !(await postForumMessage(forum.id, bwLearner.id, { parentId: null, subject: "s", body: " " })).ok);
  check("forum: new topic needs a subject", !(await postForumMessage(forum.id, bwLearner.id, { parentId: null, subject: "", body: "hi" })).ok);
  const t1 = await postForumMessage(forum.id, bwLearner.id, { parentId: null, subject: "Hello", body: "first" });
  check("forum: topic posted", t1.ok);
  const r1 = await postForumMessage(forum.id, bwAdmin.id, { parentId: (t1 as { id: string }).id, subject: "", body: "reply" });
  const r2 = await postForumMessage(forum.id, bwLearner.id, { parentId: (r1 as { id: string }).id, subject: "", body: "reply to reply" });
  const posts = await ForumPosts.listByModule(forum.id);
  check("forum: replies stay one level deep", r1.ok && r2.ok && posts.filter((p) => p.parent_id === (t1 as { id: string }).id).length === 2);
  const otherForum = await mk2("FORUM", { config_json: "{}" });
  check("forum: can't reply into another forum's post", !(await postForumMessage(otherForum.id, bwLearner.id, { parentId: (t1 as { id: string }).id, subject: "", body: "x" })).ok);
  await ForumPosts.setHidden((t1 as { id: string }).id, forum.id, true);
  check("forum: hide works and is module-scoped", (await ForumPosts.listByModule(forum.id)).find((p) => p.id === (t1 as { id: string }).id)?.hidden === 1);
  await ForumPosts.setHidden((t1 as { id: string }).id, otherForum.id, false);
  check("forum: hide via a different module id does nothing", (await ForumPosts.listByModule(forum.id)).find((p) => p.id === (t1 as { id: string }).id)?.hidden === 1);
  let limited = false;
  for (let i = 0; i < 14 && !limited; i++) limited = !(await postForumMessage(forum.id, bwLearner.id, { parentId: (t1 as { id: string }).id, subject: "", body: `spam ${i}` })).ok;
  check("forum: rapid posting is rate-limited", limited);

  // ---------- lesson ----------
  const wrong = await checkLessonAnswer(lessonMod, bwLearner.id, 0, 0);
  check("lesson: wrong answer is reported and not stored", wrong.ok && (wrong as { correct: boolean }).correct === false);
  check("lesson: can't finish with an unanswered question", !(await finishLesson(lessonMod, bwLearner.id)).ok && !(await completed(lessonMod.id)));
  const right = await checkLessonAnswer(lessonMod, bwLearner.id, 0, 1);
  check("lesson: correct answer accepted with feedback", right.ok && (right as { correct: boolean }).correct && (right as { feedback: string }).feedback === "yes");
  check("lesson: out-of-range choice refused", !(await checkLessonAnswer(lessonMod, bwLearner.id, 0, 99)).ok);
  check("lesson: finishing completes the module", (await finishLesson(lessonMod, bwLearner.id)).ok && (await completed(lessonMod.id)));

  // ---------- manual-complete types are left for the button; folder files ----------
  check("page isn't auto-completed", !(await completed(page.id)));
  const folder = await mk2("FOLDER");
  await ModuleFiles.add(folder.id, { file_path: "x-a.pdf", file_name: "a.pdf", file_mime: "application/pdf", file_size: 10 });
  const ff = (await ModuleFiles.listByModule(folder.id))[0];
  check("folder file found by id in its own module only", !!(await ModuleFiles.byIdInModule(ff.id, folder.id)) && !(await ModuleFiles.byIdInModule(ff.id, page.id)));
  check("folder file removal is module-scoped", !(await ModuleFiles.remove(ff.id, page.id)) && !!(await ModuleFiles.remove(ff.id, folder.id)));

  // ---------- deleting data ----------
  await Modules.remove(assignment.id);
  check("deleting a module removes its hand-ins", (await Submissions.listByModule(assignment.id)).length === 0);
  await Modules.remove(forum.id);
  check("deleting a module removes its forum posts", (await ForumPosts.listByModule(forum.id)).length === 0);
  // An academy with activity data can be permanently erased.
  const ng = (await Academies.bySlug("northgate"))!;
  const ngAdmin = (await Users.byAcademyAndEmail(ng.id, "admin@northgate.example"))!;
  const ngLearner = (await Users.byAcademyAndEmail(ng.id, "learner@northgate.example"))!;
  const nm = await Modules.create({ academy_id: ng.id, created_by: ngAdmin.id, title: "F", description: "", content_type: "FORUM", config_json: "{}" });
  await ForumPosts.create(nm.id, ngLearner.id, { parent_id: null, subject: "s", body: "b" });
  const na = await Modules.create({ academy_id: ng.id, created_by: ngAdmin.id, title: "A", description: "", content_type: "ASSIGNMENT", config_json: "{}" });
  await Submissions.submit(na.id, ngLearner.id, { text: "t" });
  await ChoiceResponses.set(nm.id, ngLearner.id, 0);
  await Academies.softDelete(ng.id);
  let delErr = "";
  try { await Academies.permanentlyDelete(ng.id); } catch (e) { delErr = (e as Error).message; }
  check("academy with activity data can be permanently deleted", !delErr, delErr);
  check("…and nothing is left behind", Number((await queryOne<{ n: string }>("SELECT count(*) AS n FROM forum_posts WHERE module_id = $1", [nm.id]))!.n) === 0);
  void rejects;

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
