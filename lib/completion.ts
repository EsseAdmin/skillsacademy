// Marks a module complete for a learner in every course they are enrolled in
// (and have paid for) that contains it, then updates progress and issues a
// certificate when the course is finished. Modules can be reused across
// courses, so activities (assignments, polls, forums, lessons) complete by
// module rather than by one course.
import { Enrollments, ModuleCompletions, Modules } from "@/lib/queries";
import { learnerEnrollmentsFor } from "@/lib/moduleAccess";
import { maybeIssueCertificate } from "@/lib/certificates";

export async function completeModuleForLearner(academyId: string, learnerId: string, moduleId: string): Promise<number> {
  const enrollments = await learnerEnrollmentsFor(academyId, learnerId, moduleId);
  for (const e of enrollments) {
    await ModuleCompletions.complete(e.id, moduleId);
    const total = (await Modules.listByCourse(e.course_id)).length;
    const done = (await ModuleCompletions.listByEnrollment(e.id)).length;
    await Enrollments.setProgress(e.id, total > 0 ? Math.round((done / total) * 100) : 0);
    await maybeIssueCertificate(e.course_id, learnerId);
  }
  return enrollments.length;
}
