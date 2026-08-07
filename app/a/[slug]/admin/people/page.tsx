import { notFound } from "next/navigation";
import { Academies, Templates, Users, Courses, Enrollments, CourseInstructors } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { themeVars } from "@/lib/theme";
import PortalShell from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import AddUserForm from "@/components/AddUserForm";
import { ADMIN_NAV } from "@/lib/nav";
import { addUser, toggleUserActive, removeUser } from "@/lib/actions/users";
import { enrollLearnerManually } from "@/lib/actions/learning";
import { assignInstructorToCourse } from "@/lib/actions/courses";

export default async function PeoplePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const template = (await Templates.byId(academy.template_id))!;

  const instructors = await Users.listByAcademy(academy.id, "INSTRUCTOR");
  const learners = await Users.listByAcademy(academy.id, "LEARNER");
  const courses = await Courses.listByAcademy(academy.id);

  const instructorsWithCourses = await Promise.all(
    instructors.map(async (u) => {
      const assignedCourseIds = new Set((await CourseInstructors.listByInstructor(u.id)).map((c) => c.course_id));
      const unassignedCourses = courses.filter((c) => !assignedCourseIds.has(c.id));
      return { user: u, assignedCourseIds, unassignedCourses };
    })
  );

  const learnersWithEnrollments = await Promise.all(
    learners.map(async (u) => {
      const enrolledCourseIds = new Set((await Enrollments.listByLearner(u.id)).map((e) => e.course_id));
      const notEnrolled = courses.filter((c) => !enrolledCourseIds.has(c.id));
      return { user: u, enrolledCourseIds, notEnrolled };
    })
  );

  const boundAdd = addUser.bind(null, slug);
  const boundToggle = toggleUserActive.bind(null, slug);
  const boundRemove = removeUser.bind(null, slug);
  const boundEnrollLearner = enrollLearnerManually.bind(null, slug);
  const boundAssignInstructor = assignInstructorToCourse.bind(null, slug);

  return (
    <PortalShell
      brandName={academy.logo_text}
      brandTag="Academy Admin"
      themeStyle={themeVars(template)}
      navItems={ADMIN_NAV(slug)}
      activeHref={`/a/${slug}/admin/people`}
      userName={session.name}
      userRoleLabel="Academy Admin"
      logoutRedirect={`/a/${slug}/login`}
      trialBanner={<TrialBanner academy={academy} slug={slug} showManage />}
    >
      <h1 className="text-2xl font-bold text-gray-900 mb-1">People</h1>
      <p className="text-gray-500 text-sm mb-8">
        Manage instructors and learners in {academy.name}, and assign them directly to courses.
      </p>

      <div className="app-card p-6 mb-8">
        <h2 className="font-semibold text-gray-900 mb-4">Add a new person</h2>
        <AddUserForm action={boundAdd} allowInstructor />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="app-card p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Instructors ({instructors.length})</h2>
          <div className="space-y-4">
            {instructorsWithCourses.map(({ user: u, assignedCourseIds, unassignedCourses }) => {
              return (
                <PersonRow
                  key={u.id}
                  user={u}
                  boundToggle={boundToggle}
                  boundRemove={boundRemove}
                  assignedCount={assignedCourseIds.size}
                  assignLabel="course(s) teaching"
                >
                  {unassignedCourses.length > 0 && (
                    <form action={boundAssignInstructor} className="flex gap-2">
                      <input type="hidden" name="instructorId" value={u.id} />
                      <select name="courseId" className="rounded-md border border-gray-300 px-3 py-1.5 text-xs flex-1">
                        {unassignedCourses.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="text-xs font-semibold rounded-md px-3 py-1.5 border border-gray-300 hover:bg-gray-50">
                        Assign
                      </button>
                    </form>
                  )}
                </PersonRow>
              );
            })}
            {instructors.length === 0 && <p className="text-sm text-gray-500">None yet.</p>}
          </div>
        </div>

        <div className="app-card p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Learners ({learners.length})</h2>
          <div className="space-y-4">
            {learnersWithEnrollments.map(({ user: u, enrolledCourseIds, notEnrolled }) => {
              return (
                <PersonRow
                  key={u.id}
                  user={u}
                  boundToggle={boundToggle}
                  boundRemove={boundRemove}
                  assignedCount={enrolledCourseIds.size}
                  assignLabel="course(s) enrolled"
                >
                  {notEnrolled.length > 0 && (
                    <form action={boundEnrollLearner} className="flex gap-2">
                      <input type="hidden" name="learnerId" value={u.id} />
                      <select name="courseId" className="rounded-md border border-gray-300 px-3 py-1.5 text-xs flex-1">
                        {notEnrolled.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="text-xs font-semibold rounded-md px-3 py-1.5 border border-gray-300 hover:bg-gray-50">
                        Enrol
                      </button>
                    </form>
                  )}
                </PersonRow>
              );
            })}
            {learners.length === 0 && <p className="text-sm text-gray-500">None yet.</p>}
          </div>
        </div>
      </div>
    </PortalShell>
  );
}

function PersonRow({
  user,
  boundToggle,
  boundRemove,
  assignedCount,
  assignLabel,
  children,
}: {
  user: { id: string; name: string; email: string; is_active: number; role: string };
  boundToggle: (formData: FormData) => void;
  boundRemove: (formData: FormData) => void;
  assignedCount: number;
  assignLabel: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-b border-gray-100 pb-4 last:border-0">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-sm font-medium text-gray-900">{user.name}</div>
          <div className="text-xs text-gray-500">{user.email}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-1 rounded-full font-semibold ${user.is_active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
            {user.is_active ? "Active" : "Suspended"}
          </span>
          <form action={boundToggle}>
            <input type="hidden" name="userId" value={user.id} />
            <button type="submit" className="text-xs text-gray-500 hover:text-gray-900 underline">
              {user.is_active ? "Suspend" : "Reactivate"}
            </button>
          </form>
          <form action={boundRemove}>
            <input type="hidden" name="userId" value={user.id} />
            <button type="submit" className="text-xs text-red-500 hover:text-red-700 underline">
              Remove
            </button>
          </form>
        </div>
      </div>
      <div className="text-xs text-gray-400 mb-2">
        {assignedCount} {assignLabel}
      </div>
      {children}
    </div>
  );
}
