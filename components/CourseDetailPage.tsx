import Link from "next/link";
import { notFound } from "next/navigation";
import { Academies, Templates, Courses, Modules, Enrollments, Users, CourseInstructors } from "@/lib/queries";
import { themeVars } from "@/lib/theme";
import { formatGBP } from "@/lib/utils";
import PortalShell from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import {
  updateCourse,
  deleteCourse,
  assignModuleToCourse,
  unassignModuleFromCourse,
  assignInstructorToCourse,
  unassignInstructorFromCourse,
} from "@/lib/actions/courses";
import { enrollLearnerManually } from "@/lib/actions/learning";
import type { SessionPayload } from "@/lib/auth";
import type { NavItem } from "@/components/PortalShell";

const CONTENT_ICON: Record<string, string> = { TEXT: "📝", URL: "🔗", FILE: "📎" };

export default async function CourseDetailPage({
  slug,
  area,
  courseId,
  session,
  navItems,
}: {
  slug: string;
  area: "admin" | "instructor";
  courseId: string;
  session: SessionPayload;
  navItems: NavItem[];
}) {
  const academy = (await Academies.bySlug(slug))!;
  const template = (await Templates.byId(academy.template_id))!;
  const course = await Courses.byId(courseId);
  if (!course || course.academy_id !== academy.id) notFound();

  const assignedModules = await Modules.listByCourse(courseId);
  const assignedIds = new Set(assignedModules.map((m) => m.id));
  const allModules = await Modules.listByAcademy(academy.id);
  const availableModules = allModules.filter((m) => !assignedIds.has(m.id));
  const enrollments = await Enrollments.listByCourse(courseId);

  const assignedInstructors = await CourseInstructors.listByCourse(courseId);
  const assignedInstructorIds = new Set(assignedInstructors.map((i) => i.id));
  const allInstructors = await Users.listByAcademy(academy.id, "INSTRUCTOR");
  const availableInstructors = allInstructors.filter((i) => !assignedInstructorIds.has(i.id));

  const enrolledLearnerIds = new Set(enrollments.map((e) => e.learner_id));
  const allLearners = await Users.listByAcademy(academy.id, "LEARNER");
  const availableLearners = allLearners.filter((l) => !enrolledLearnerIds.has(l.id));

  const enrollmentsWithLearner = await Promise.all(
    enrollments.map(async (e) => {
      const learner = await Users.byId(e.learner_id);
      return { ...e, learner };
    })
  );

  const boundUpdate = updateCourse.bind(null, slug);
  const boundDelete = deleteCourse.bind(null, slug);
  const boundAssign = assignModuleToCourse.bind(null, slug);
  const boundUnassign = unassignModuleFromCourse.bind(null, slug);
  const boundAssignInstructor = assignInstructorToCourse.bind(null, slug);
  const boundUnassignInstructor = unassignInstructorFromCourse.bind(null, slug);
  const boundEnrollLearner = enrollLearnerManually.bind(null, slug);

  return (
    <PortalShell
      brandName={academy.logo_text}
      brandTag={area === "admin" ? "Academy Admin" : "Instructor"}
      themeStyle={themeVars(template)}
      navItems={navItems}
      activeHref={`/a/${slug}/${area}/courses`}
      userName={session.name}
      userRoleLabel={area === "admin" ? "Academy Admin" : "Instructor"}
      logoutRedirect={`/a/${slug}/login`}
      trialBanner={<TrialBanner academy={academy} slug={slug} showManage={area === "admin"} />}
    >
      <Link href={`/a/${slug}/${area}/courses`} className="text-sm app-link mb-4 inline-block">
        ← All courses
      </Link>
      <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {course.cover_emoji} {course.title}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {course.category} · {course.price_pence > 0 ? formatGBP(course.price_pence) : "Free"} ·{" "}
            {course.is_published ? "Published" : "Draft"}
          </p>
        </div>
        <form action={boundDelete}>
          <input type="hidden" name="courseId" value={course.id} />
          <button type="submit" className="text-sm text-red-600 border border-red-200 rounded-md px-4 py-2 hover:bg-red-50">
            Delete Course
          </button>
        </form>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="app-card p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Course Details</h2>
            <form action={boundUpdate} className="grid gap-4">
              <input type="hidden" name="courseId" value={course.id} />
              <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
                Title
                <input name="title" defaultValue={course.title} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
                Description
                <textarea name="description" defaultValue={course.description} rows={3} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <div className="grid grid-cols-3 gap-4">
                <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
                  Category
                  <input name="category" defaultValue={course.category} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
                  Price (£)
                  <input name="price" type="number" min="0" step="0.01" defaultValue={(course.price_pence / 100).toFixed(2)} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
                  Emoji
                  <input name="emoji" defaultValue={course.cover_emoji} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" name="is_published" defaultChecked={!!course.is_published} />
                Published (visible to learners in the catalog)
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" name="certification_enabled" defaultChecked={!!course.certification_enabled} />
                Issue a certificate automatically once a learner completes every module and passes every attached quiz
              </label>
              <div>
                <button type="submit" className="app-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold">
                  Save Changes
                </button>
              </div>
            </form>
          </div>

          <div className="app-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Modules ({assignedModules.length})</h2>
              <Link href={`/a/${slug}/${area}/modules?courseId=${course.id}`} className="text-sm app-link font-semibold">
                + New module
              </Link>
            </div>
            <div className="space-y-2 mb-4">
              {assignedModules.map((m, i) => (
                <div key={m.id} className="flex items-center justify-between border border-gray-200 rounded-md px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-5">{i + 1}</span>
                    <span>{CONTENT_ICON[m.content_type]}</span>
                    <div>
                      <div className="text-sm font-medium text-gray-900">{m.title}</div>
                      <div className="text-xs text-gray-500">{m.content_type}</div>
                    </div>
                  </div>
                  <form action={boundUnassign}>
                    <input type="hidden" name="courseId" value={course.id} />
                    <input type="hidden" name="moduleId" value={m.id} />
                    <button type="submit" className="text-xs text-gray-400 hover:text-red-600">
                      Remove
                    </button>
                  </form>
                </div>
              ))}
              {assignedModules.length === 0 && <p className="text-sm text-gray-500">No modules assigned yet.</p>}
            </div>
            {availableModules.length > 0 && (
              <form action={boundAssign} className="flex gap-2 items-end border-t border-gray-100 pt-4">
                <input type="hidden" name="courseId" value={course.id} />
                <label className="text-xs font-semibold text-gray-600 grid gap-1.5 flex-1">
                  Assign an existing module
                  <select name="moduleId" className="rounded-md border border-gray-300 px-3 py-2 text-sm">
                    {availableModules.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title} ({m.content_type})
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="rounded-md px-4 py-2 text-sm font-semibold border border-gray-300 hover:bg-gray-50">
                  Assign
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="space-y-6 h-fit">
          <div className="app-card p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Assigned Instructors ({assignedInstructors.length})</h2>
            <div className="space-y-2 mb-4">
              {assignedInstructors.map((ins) => (
                <div key={ins.id} className="flex items-center justify-between border border-gray-200 rounded-md px-3 py-2">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{ins.name}</div>
                    <div className="text-xs text-gray-500">{ins.email}</div>
                  </div>
                  <form action={boundUnassignInstructor}>
                    <input type="hidden" name="courseId" value={course.id} />
                    <input type="hidden" name="instructorId" value={ins.id} />
                    <button type="submit" className="text-xs text-gray-400 hover:text-red-600">
                      Remove
                    </button>
                  </form>
                </div>
              ))}
              {assignedInstructors.length === 0 && <p className="text-sm text-gray-500">No instructors assigned yet.</p>}
            </div>
            {availableInstructors.length > 0 && (
              <form action={boundAssignInstructor} className="flex gap-2 items-end border-t border-gray-100 pt-4">
                <input type="hidden" name="courseId" value={course.id} />
                <label className="text-xs font-semibold text-gray-600 grid gap-1.5 flex-1">
                  Assign an instructor
                  <select name="instructorId" className="rounded-md border border-gray-300 px-3 py-2 text-sm">
                    {availableInstructors.map((ins) => (
                      <option key={ins.id} value={ins.id}>
                        {ins.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="rounded-md px-4 py-2 text-sm font-semibold border border-gray-300 hover:bg-gray-50">
                  Assign
                </button>
              </form>
            )}
            {availableInstructors.length === 0 && allInstructors.length === 0 && (
              <p className="text-xs text-gray-400">Add instructors on the People page first.</p>
            )}
          </div>

          <div className="app-card p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Enrolled Learners ({enrollments.length})</h2>
            <div className="space-y-3 mb-4">
              {enrollmentsWithLearner.map((e) => {
                const learner = e.learner;
                return (
                  <div key={e.id} className="text-sm">
                    <div className="font-medium text-gray-900">{learner?.name || "Unknown"}</div>
                    <div className="text-xs text-gray-500 flex justify-between">
                      <span className="capitalize">{e.payment_status}</span>
                      <span>{e.progress_pct}% complete</span>
                    </div>
                  </div>
                );
              })}
              {enrollments.length === 0 && <p className="text-sm text-gray-500">No learners enrolled yet.</p>}
            </div>
            {availableLearners.length > 0 && (
              <form action={boundEnrollLearner} className="flex gap-2 items-end border-t border-gray-100 pt-4">
                <input type="hidden" name="courseId" value={course.id} />
                <label className="text-xs font-semibold text-gray-600 grid gap-1.5 flex-1">
                  Enrol a learner
                  <select name="learnerId" className="rounded-md border border-gray-300 px-3 py-2 text-sm">
                    {availableLearners.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="rounded-md px-4 py-2 text-sm font-semibold border border-gray-300 hover:bg-gray-50">
                  Enrol
                </button>
              </form>
            )}
            {availableLearners.length === 0 && allLearners.length === 0 && (
              <p className="text-xs text-gray-400">Add learners on the People page first.</p>
            )}
          </div>
        </div>
      </div>
    </PortalShell>
  );
}
