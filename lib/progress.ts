// Recording that a learner finished a module, and keeping course progress right.
//
// A "Module with sections" (SECTIONS) is listed in the course; the activities and resources inside its sections are
// modules of their own (parent_module_id). Their completions are stored like any other, but progress counts only the
// modules the course lists. The container completes by itself once every item in it is complete.
import { Enrollments, ModuleCompletions, ModuleItems, Modules } from "@/lib/queries";
import { queryOne } from "@/lib/db";
import { maybeIssueCertificate } from "@/lib/certificates";

/** Number of this enrollment's completed modules that the course lists (items inside sections don't count twice). */
export async function completedCourseModules(enrollmentId: string, courseId: string): Promise<number> {
  const row = await queryOne<{ n: number }>(
    `SELECT count(*)::int AS n FROM module_completions mc
       JOIN course_modules cm ON cm.module_id = mc.module_id AND cm.course_id = $2
      WHERE mc.enrollment_id = $1`,
    [enrollmentId, courseId]
  );
  return row?.n ?? 0;
}

export async function refreshProgress(enrollmentId: string, courseId: string, learnerId: string): Promise<void> {
  const total = await Modules.countByCourse(courseId);
  const done = await completedCourseModules(enrollmentId, courseId);
  await Enrollments.setProgress(enrollmentId, total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0);
  await maybeIssueCertificate(courseId, learnerId);
}

/** True when the container has items and every one of them is complete for this enrollment. */
export async function allItemsComplete(enrollmentId: string, containerId: string): Promise<boolean> {
  const items = await ModuleItems.listByParent(containerId);
  if (items.length === 0) return false;
  const done = new Set(await ModuleCompletions.listByEnrollment(enrollmentId));
  return items.every((i) => done.has(i.id));
}

/** Marks one module complete for one enrollment, completes its container when everything in it is done, and updates progress. */
export async function recordCompletion(enrollment: { id: string; course_id: string; learner_id: string }, moduleId: string): Promise<void> {
  await ModuleCompletions.complete(enrollment.id, moduleId);
  const mod = await Modules.byId(moduleId);
  if (mod?.parent_module_id && (await allItemsComplete(enrollment.id, mod.parent_module_id))) {
    await ModuleCompletions.complete(enrollment.id, mod.parent_module_id);
  }
  await refreshProgress(enrollment.id, enrollment.course_id, enrollment.learner_id);
}
