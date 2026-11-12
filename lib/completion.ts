// Marks a module complete for a learner in every course they are enrolled in
// (and have paid for) that contains it, then updates progress and issues a
// certificate when the course is finished. Modules can be reused across
// courses, so activities (assignments, polls, forums, lessons) complete by
// module rather than by one course. Items inside a section of a "Module with
// sections" complete the same way (see lib/progress.ts).
import { learnerEnrollmentsFor } from "@/lib/moduleAccess";
import { recordCompletion } from "@/lib/progress";

export async function completeModuleForLearner(academyId: string, learnerId: string, moduleId: string): Promise<number> {
  const enrollments = await learnerEnrollmentsFor(academyId, learnerId, moduleId);
  for (const e of enrollments) await recordCompletion(e, moduleId);
  return enrollments.length;
}
