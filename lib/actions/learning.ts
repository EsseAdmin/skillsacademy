"use server";

import { courseNeedsPayment } from "@/lib/coursePayment";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Academies, Courses, Enrollments, ModuleItems, Modules } from "@/lib/queries";
import { moduleInCourse } from "@/lib/moduleAccess";
import { allItemsComplete, recordCompletion } from "@/lib/progress";
import { requireTenantSession } from "@/lib/authz";
import { AUTO_COMPLETE_TYPES } from "@/lib/activities";
import { isTypeEnabled } from "@/lib/courseTypes";

export async function enrollFree(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["LEARNER"]);
  const courseId = String(formData.get("courseId") || "");
  const course = await Courses.byId(courseId);
  if (!course || course.academy_id !== session.academyId) return;
  const existing = await Enrollments.byCourseAndLearner(courseId, session.userId);
  if (existing) {
    redirect(`/a/${slug}/learner/courses/${courseId}`);
  }
  // A course type the academy has switched off can't be joined any more (people already in it keep access).
  const academy = await Academies.byId(session.academyId!);
  if (!academy || !isTypeEnabled(academy.enabled_course_types, course.course_type)) return;
  if (courseNeedsPayment(course)) {
    redirect(`/a/${slug}/learner/checkout/${courseId}`);
  }
  await Enrollments.create({ academy_id: session.academyId!, course_id: courseId, learner_id: session.userId, payment_status: "free" });
  revalidatePath(`/a/${slug}/learner`);
  redirect(`/a/${slug}/learner/courses/${courseId}`);
}

export async function enrollLearnerManually(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const courseId = String(formData.get("courseId") || "");
  const learnerId = String(formData.get("learnerId") || "");
  const course = await Courses.byId(courseId);
  if (!course || course.academy_id !== session.academyId) return;
  const existing = await Enrollments.byCourseAndLearner(courseId, learnerId);
  if (existing) return;
  await Enrollments.create({ academy_id: session.academyId!, course_id: courseId, learner_id: learnerId, payment_status: courseNeedsPayment(course) ? "paid" : "free" });
  const area = session.role === "ACADEMY_ADMIN" ? "admin" : "instructor";
  revalidatePath(`/a/${slug}/${area}/learners`);
  revalidatePath(`/a/${slug}/${area}/courses/${courseId}`);
  revalidatePath(`/a/${slug}/admin/people`);
}

export async function markModuleComplete(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["LEARNER"]);
  const courseId = String(formData.get("courseId") || "");
  const moduleId = String(formData.get("moduleId") || "");
  const enrollment = await Enrollments.byCourseAndLearner(courseId, session.userId);
  if (!enrollment || enrollment.academy_id !== session.academyId) return;
  // Only modules that really are in this course (or sit in a section of one that is), and only types completed by
  // a click. Quizzes, SCORM, assignments, polls, forums and lessons complete
  // through what the learner does in them, never through this button.
  if (!(await moduleInCourse(courseId, moduleId))) return;
  const mod = await Modules.byId(moduleId);
  if (!mod || mod.academy_id !== session.academyId || AUTO_COMPLETE_TYPES.includes(mod.content_type)) return;
  // A module with sections finishes by itself when every item is done; the button only exists for one that is empty
  // (or whose items were all finished before it was added to), so it can't be skipped past unfinished work.
  if (mod.content_type === "SECTIONS" && (await ModuleItems.countByParent(mod.id)) > 0 && !(await allItemsComplete(enrollment.id, mod.id))) return;
  await recordCompletion(enrollment, moduleId);
  revalidatePath(`/a/${slug}/learner/courses/${courseId}`);
  revalidatePath(`/a/${slug}/learner`);
}
