// Who may see or manage a module. Used by the activity pages, the file
// download routes and the grading/moderation actions. Everything is keyed on
// the academy in the caller's session — a module id from another academy is
// treated as if it didn't exist.
import { queryAll, queryOne } from "@/lib/db";
import type { ModuleRow, Enrollment } from "@/lib/queries";
import type { SessionPayload } from "@/lib/auth";

// An instructor "owns" a module they created, were assigned to, or that sits
// in a course they created or teach. Admins own everything in their academy.
// Parameters: $1 = academy id, $2 = instructor user id.
export const INSTRUCTOR_MODULE_SQL = `
  m.created_by = $2
  OR EXISTS (SELECT 1 FROM module_instructors mi WHERE mi.module_id = m.id AND mi.instructor_id = $2)
  OR EXISTS (
    SELECT 1 FROM course_modules cm JOIN courses c ON c.id = cm.course_id
    WHERE cm.module_id = m.id AND c.academy_id = $1
      AND (c.created_by = $2 OR EXISTS (SELECT 1 FROM course_instructors ci WHERE ci.course_id = c.id AND ci.instructor_id = $2))
  )`;

/** The module, if this admin/instructor session may manage it. */
export async function staffModule(session: SessionPayload, moduleId: string): Promise<ModuleRow | undefined> {
  if (!session.academyId) return undefined;
  if (session.role === "ACADEMY_ADMIN") {
    return queryOne<ModuleRow>("SELECT * FROM modules m WHERE m.id = $1 AND m.academy_id = $2", [moduleId, session.academyId]);
  }
  if (session.role === "INSTRUCTOR") {
    return queryOne<ModuleRow>(`SELECT m.* FROM modules m WHERE m.id = $3 AND m.academy_id = $1 AND (${INSTRUCTOR_MODULE_SQL})`, [session.academyId, session.userId, moduleId]);
  }
  return undefined;
}

/** Enrollments (paid or free) of this learner in courses that contain the module. */
export async function learnerEnrollmentsFor(academyId: string, learnerId: string, moduleId: string): Promise<Enrollment[]> {
  return queryAll<Enrollment>(
    `SELECT e.* FROM enrollments e
       JOIN course_modules cm ON cm.course_id = e.course_id
       JOIN courses c ON c.id = e.course_id
      WHERE e.learner_id = $1 AND e.academy_id = $2 AND c.academy_id = $2 AND cm.module_id = $3
        AND e.payment_status IN ('paid', 'free')`,
    [learnerId, academyId, moduleId]
  );
}

/** The module, if this learner is enrolled (and has paid) in a course that includes it. */
export async function learnerModule(session: SessionPayload, moduleId: string): Promise<{ mod: ModuleRow; courseId: string } | undefined> {
  if (session.role !== "LEARNER" || !session.academyId) return undefined;
  const mod = await queryOne<ModuleRow>("SELECT * FROM modules WHERE id = $1 AND academy_id = $2", [moduleId, session.academyId]);
  if (!mod) return undefined;
  const enrollments = await learnerEnrollmentsFor(session.academyId, session.userId, moduleId);
  if (enrollments.length === 0) return undefined;
  return { mod, courseId: enrollments[0].course_id };
}
