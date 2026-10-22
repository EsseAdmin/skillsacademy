import { notFound } from "next/navigation";
import Link from "next/link";
import { Academies, Templates, Enrollments, Courses } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { themeVars } from "@/lib/theme";
import PortalShell from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import { LEARNER_NAV } from "@/lib/nav";

export default async function LearnerDashboard({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await requireTenantSession(slug, ["LEARNER"]);
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const template = (await Templates.byId(academy.template_id))!;

  const enrollments = (await Enrollments.listByLearner(session.userId)).filter((e) => e.academy_id === academy.id);
  const enrollmentsWithCourses = [];
  for (const e of enrollments) {
    const course = await Courses.byId(e.course_id);
    if (course) enrollmentsWithCourses.push({ enrollment: e, course });
  }

  return (
    <PortalShell
      brandName={academy.logo_text}
      brandTag="Learner"
      themeStyle={themeVars(template)}
      navItems={LEARNER_NAV(slug)}
      activeHref={`/a/${slug}/learner`}
      userName={session.name}
      userRoleLabel="Learner"
      logoutRedirect={`/a/${slug}/login`}
      trialBanner={<TrialBanner academy={academy} slug={slug} showManage={false} />}
    >
      <h1 className="text-2xl font-bold text-gray-900 mb-1">My Learning</h1>
      <p className="text-gray-500 mb-8">Welcome back, {session.name.split(" ")[0]}.</p>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
        {enrollmentsWithCourses.map(({ enrollment: e, course }) => {
          return (
            <Link key={e.id} href={`/a/${slug}/learner/courses/${course.id}`} className="app-card p-5 block hover:shadow-md transition">
              <div className="text-3xl mb-3">{course.cover_emoji}</div>
              <div className="font-semibold text-gray-900 mb-1">{course.title}</div>
              <div className="text-xs text-gray-500 mb-3 capitalize">{e.payment_status}</div>
              <div className="w-full bg-gray-100 rounded-full h-2 mb-1.5">
                <div className="h-2 rounded-full app-btn-accent" style={{ width: `${e.progress_pct}%` }} />
              </div>
              <div className="text-xs text-gray-500">{e.progress_pct}% complete</div>
            </Link>
          );
        })}
      </div>

      {enrollments.length === 0 && (
        <div className="app-card p-8 text-center">
          <p className="text-gray-600 mb-4">You&apos;re not enrolled in any courses yet.</p>
          <Link href={`/a/${slug}/learner/catalog`} className="app-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold inline-block">
            Browse the course catalog
          </Link>
        </div>
      )}

      {enrollments.length > 0 && (
        <Link href={`/a/${slug}/learner/catalog`} className="app-link text-sm font-semibold">
          Browse more courses →
        </Link>
      )}
    </PortalShell>
  );
}
