// The rules for what a learner (or staff member) can do inside an activity.
// Kept free of sessions and redirects so each rule can be tested directly; the
// server actions call these after they have authorised the module.
import type { ModuleRow } from "@/lib/queries";
import { ChoiceResponses, ForumPosts, LessonProgressStore, Submissions } from "@/lib/activityQueries";
import { LIMITS, clip, readAssignment, readChoice, readLesson } from "@/lib/activities";
import { assertDocument, assertTotalSize, isRealFile, storeUpload } from "@/lib/uploads";
import { completeModuleForLearner } from "@/lib/completion";
import { deleteFile } from "@/lib/storage";
import { ActivityInputError } from "@/lib/activities";

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

// ---------- Forum ----------
const FORUM_WINDOW_MS = 10 * 60 * 1000;
const FORUM_MAX_PER_WINDOW = 10;

export async function postForumMessage(
  moduleId: string,
  authorId: string,
  v: { parentId: string | null; subject: string; body: string }
): Promise<Result<{ id: string }>> {
  const body = clip(v.body, LIMITS.forumBody);
  if (!body) return { ok: false, error: "Write a message before posting." };
  const recent = await ForumPosts.countRecentByAuthor(moduleId, authorId, new Date(Date.now() - FORUM_WINDOW_MS).toISOString());
  if (recent >= FORUM_MAX_PER_WINDOW) return { ok: false, error: "You're posting very quickly — wait a few minutes and try again." };
  let parentId: string | null = null;
  if (v.parentId) {
    const parent = await ForumPosts.byIdInModule(v.parentId, moduleId); // a post from another module/academy is "not found"
    if (!parent) return { ok: false, error: "That post no longer exists." };
    parentId = parent.parent_id ?? parent.id; // replies stay one level deep
  }
  const subject = parentId ? null : clip(v.subject, LIMITS.forumSubject) || null;
  if (!parentId && !subject) return { ok: false, error: "Give your new topic a subject." };
  const id = await ForumPosts.create(moduleId, authorId, { parent_id: parentId, subject, body });
  return { ok: true, id };
}

// ---------- Choice ----------
export async function recordChoice(mod: ModuleRow, learnerId: string, optionIndex: number): Promise<Result> {
  if (mod.content_type !== "CHOICE") return { ok: false, error: "That isn't a choice activity." };
  const cfg = readChoice(mod.config_json);
  if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= cfg.options.length) return { ok: false, error: "Pick one of the options." };
  if (cfg.allowChange) {
    await ChoiceResponses.set(mod.id, learnerId, optionIndex);
  } else if (!(await ChoiceResponses.insertOnce(mod.id, learnerId, optionIndex))) {
    return { ok: false, error: "You've already answered this one, and answers can't be changed." };
  }
  await completeModuleForLearner(mod.academy_id, learnerId, mod.id);
  return { ok: true };
}

// ---------- Assignment ----------
export async function submitAssignment(mod: ModuleRow, learnerId: string, input: { text: string; file: FormDataEntryValue | null }): Promise<Result<{ late: boolean }>> {
  if (mod.content_type !== "ASSIGNMENT") return { ok: false, error: "That isn't an assignment." };
  const cfg = readAssignment(mod.config_json);
  const existing = await Submissions.byModuleAndLearner(mod.id, learnerId);
  if (existing?.status === "GRADED") return { ok: false, error: "This assignment has been graded, so it can't be changed. Ask your instructor if you need to resubmit." };
  const text = cfg.allowText ? clip(input.text, LIMITS.submissionText) : "";
  const hasFile = cfg.allowFile && isRealFile(input.file);
  if (!text && !hasFile && !(existing?.file_path && cfg.allowFile)) {
    return { ok: false, error: cfg.allowText && cfg.allowFile ? "Write your answer or attach a file." : cfg.allowText ? "Write your answer." : "Attach a file." };
  }
  let stored: Awaited<ReturnType<typeof storeUpload>> | null = null;
  try {
    if (hasFile) {
      const f = input.file as File;
      assertDocument(f);
      assertTotalSize([f]);
      stored = await storeUpload(f);
    }
  } catch (e) {
    if (e instanceof ActivityInputError) return { ok: false, error: e.message };
    throw e;
  }
  const applied = await Submissions.submit(mod.id, learnerId, { text: text || null, file: stored });
  if (!applied) {
    if (stored) await deleteFile(stored.file_path);
    return { ok: false, error: "This assignment has been graded, so it can't be changed." };
  }
  if (stored && existing?.file_path) await deleteFile(existing.file_path);
  await completeModuleForLearner(mod.academy_id, learnerId, mod.id);
  const late = !!cfg.dueAt && Date.now() > new Date(cfg.dueAt).getTime();
  return { ok: true, late };
}

// ---------- Lesson ----------
/** Checks one answer on the server (the answer key never reaches the browser). */
export async function checkLessonAnswer(mod: ModuleRow, learnerId: string, pageIndex: number, choice: number): Promise<Result<{ correct: boolean; feedback: string }>> {
  if (mod.content_type !== "LESSON") return { ok: false, error: "That isn't a lesson." };
  const pages = readLesson(mod.config_json);
  const q = pages[pageIndex]?.question;
  if (!q) return { ok: false, error: "That page has no question." };
  if (!Number.isInteger(choice) || choice < 0 || choice >= q.options.length) return { ok: false, error: "Pick one of the answers." };
  const correct = choice === q.correct;
  if (correct) {
    const row = await LessonProgressStore.byModuleAndLearner(mod.id, learnerId);
    const answers = row ? (JSON.parse(row.answers_json || "{}") as Record<string, number>) : {};
    answers[String(pageIndex)] = choice;
    await LessonProgressStore.saveAnswers(mod.id, learnerId, answers);
  }
  return { ok: true, correct, feedback: correct ? q.feedbackCorrect : q.feedbackWrong };
}

export async function lessonAnswered(moduleId: string, learnerId: string): Promise<number[]> {
  const row = await LessonProgressStore.byModuleAndLearner(moduleId, learnerId);
  if (!row) return [];
  try {
    return Object.keys(JSON.parse(row.answers_json || "{}")).map(Number);
  } catch {
    return [];
  }
}

export async function finishLesson(mod: ModuleRow, learnerId: string): Promise<Result> {
  if (mod.content_type !== "LESSON") return { ok: false, error: "That isn't a lesson." };
  const pages = readLesson(mod.config_json);
  const answered = new Set(await lessonAnswered(mod.id, learnerId));
  const missing = pages.map((p, i) => (p.question && !answered.has(i) ? i + 1 : 0)).filter(Boolean);
  if (missing.length) return { ok: false, error: `Answer the question on page ${missing[0]} correctly before finishing.` };
  await LessonProgressStore.markCompleted(mod.id, learnerId);
  await completeModuleForLearner(mod.academy_id, learnerId, mod.id);
  return { ok: true };
}
