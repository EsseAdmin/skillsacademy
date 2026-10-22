import { notFound } from "next/navigation";
import { Academies, Templates, Users, Courses, Enrollments } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { themeVars } from "@/lib/theme";
import PortalShell from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import AddUserForm from "@/components/AddUserForm";
import { INSTRUCTOR_NAV } from "@/lib/nav";
import { addUser } from "@/lib/actions/users";
import { enrollLearnerManually } from "@/lib/actions/learning";

export default async function InstructorLearnersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await requireTenantSession(slug, ["INSTRUCTOR"]);
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const template = (await Templates.byId(academy.template_id))!;

  const learners = await Users.listByAcademy(academy.id, "LEARNER");
  const courses = await Courses.listByAcademy(academy.id);
  const boundAdd = addUser.bind(null, slug);
  const boundEnroll = enrollLearnerManually.bind(null, slug);

  const learnersWithEnrollments = await Promise.all(
    learners.map(async (l) => {
      const enrolledCourseIds = new Set((await Enrollments.listByLearner(l.id)).map((e) => e.course_id));
      const notEnrolled = courses.filter((c) => !enrolledCourseIds.has(c.id));
      return { user: l, enrolledCourseIds, notEnrolled };
    })
  );

  return (
    <PortalShell
      brandName={academy.logo_text}
      brandTag="Instructor"
      themeStyle={themeVars(template)}
      navItems={INSTRUCTOR_NAV(slug)}
      activeHref={`/a/${slug}/instructor/learners`}
      userName={session.name}
      userRoleLabel="Instructor"
      logoutRedirect={`/a/${slug}/login`}
      trialBanner={<TrialBanner academy={academy} slug={slug} showManage={false} />}
    >
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Learners</h1>
      <p className="text-gray-500 text-sm mb-8">Add new learners and enrol them directly into your courses.</p>

      <div className="app-card p-6 mb-8">
        <h2 className="font-semibold text-gray-900 mb-4">Add a new learner</h2>
        <AddUserForm action={boundAdd} allowInstructor={false} />
      </div>

      <div className="app-card p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Learners ({learners.length})</h2>
        <div className="space-y-4">
          {learnersWithEnrollments.map(({ user: l, enrolledCourseIds, notEnrolled }) => {
            return (
              <div key={l.id} className="border-b border-gray-100 pb-4 last:border-0">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{l.name}</div>
                    <div className="text-xs text-gray-500">{l.email}</div>
                  </div>
                  <span className="text-xs text-gray-400">{enrolledCourseIds.size} course(s) enrolled</span>
                </div>
                {notEnrolled.length > 0 && (
                  <form action={boundEnroll} className="flex gap-2">
                    <input type="hidden" name="learnerId" value={l.id} />
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
              </div>
            );
          })}
          {learners.length === 0 && <p className="text-sm text-gray-500">No learners yet — add one above.</p>}
        </div>
      </div>
    </PortalShell>
  );
}
