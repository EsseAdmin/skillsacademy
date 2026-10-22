"use server";

// Learner side of the activities: hand in an assignment, vote in a poll, post
// in a forum, work through a lesson. Each action first proves the learner is
// enrolled (and has paid) in a course in their own academy that contains the
// module — otherwise the module is treated as not existing.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantSession } from "@/lib/authz";
import { learnerModule } from "@/lib/moduleAccess";
import { checkLessonAnswer, finishLesson, postForumMessage, recordChoice, submitAssignment } from "@/lib/activityLogic";

function pageOf(slug: string, moduleId: string, courseId: string, extra = "") {
  return `/a/${slug}/learner/activity/${moduleId}?courseId=${encodeURIComponent(courseId)}${extra}`;
}

async function authorise(slug: string, moduleId: string) {
  const session = await requireTenantSession(slug, ["LEARNER"]);
  const found = await learnerModule(session, moduleId);
  if (!found) redirect(`/a/${slug}/learner`);
  return { session, ...found };
}

export async function submitAssignmentAction(slug: string, formData: FormData) {
  const moduleId = String(formData.get("moduleId") || "");
  const { session, mod, courseId } = await authorise(slug, moduleId);
  const res = await submitAssignment(mod, session.userId, { text: String(formData.get("submission_text") || ""), file: formData.get("file") });
  revalidatePath(`/a/${slug}/learner/courses/${courseId}`);
  revalidatePath(`/a/${slug}/learner`);
  redirect(pageOf(slug, moduleId, courseId, res.ok ? (res.late ? "&done=late" : "&done=1") : `&error=${encodeURIComponent(res.error)}`));
}

export async function submitChoiceAction(slug: string, formData: FormData) {
  const moduleId = String(formData.get("moduleId") || "");
  const { session, mod, courseId } = await authorise(slug, moduleId);
  const res = await recordChoice(mod, session.userId, Number(formData.get("option")));
  revalidatePath(`/a/${slug}/learner/courses/${courseId}`);
  revalidatePath(`/a/${slug}/learner`);
  redirect(pageOf(slug, moduleId, courseId, res.ok ? "&done=1" : `&error=${encodeURIComponent(res.error)}`));
}

export async function postForumAction(slug: string, formData: FormData) {
  const moduleId = String(formData.get("moduleId") || "");
  const { session, mod, courseId } = await authorise(slug, moduleId);
  if (mod.content_type !== "FORUM") redirect(`/a/${slug}/learner`);
  const res = await postForumMessage(mod.id, session.userId, {
    parentId: String(formData.get("parentId") || "") || null,
    subject: String(formData.get("subject") || ""),
    body: String(formData.get("body") || ""),
  });
  if (res.ok) {
    const { completeModuleForLearner } = await import("@/lib/completion");
    await completeModuleForLearner(mod.academy_id, session.userId, mod.id);
    revalidatePath(`/a/${slug}/learner/courses/${courseId}`);
    revalidatePath(`/a/${slug}/learner`);
  }
  redirect(pageOf(slug, moduleId, courseId, res.ok ? "&done=1" : `&error=${encodeURIComponent(res.error)}`));
}

// Called from the lesson player in the browser (not a form post).
export async function checkLessonAnswerAction(slug: string, moduleId: string, pageIndex: number, choice: number) {
  const { session, mod } = await authorise(slug, moduleId);
  return checkLessonAnswer(mod, session.userId, Number(pageIndex), Number(choice));
}

export async function finishLessonAction(slug: string, moduleId: string) {
  const { session, mod, courseId } = await authorise(slug, moduleId);
  const res = await finishLesson(mod, session.userId);
  if (res.ok) {
    revalidatePath(`/a/${slug}/learner/courses/${courseId}`);
    revalidatePath(`/a/${slug}/learner`);
  }
  return res;
}
