import { notFound } from "next/navigation";
import Link from "next/link";
import { Academies, Templates, Courses, Modules, Users } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { themeVars } from "@/lib/theme";
import PortalShell from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import { INSTRUCTOR_NAV } from "@/lib/nav";

export default async function InstructorDashboard({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await requireTenantSession(slug, ["INSTRUCTOR"]);
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const template = (await Templates.byId(academy.template_id))!;

  const courses = await Courses.listByAcademy(academy.id);
  const modules = await Modules.listByAcademy(academy.id);
  const learners = await Users.listByAcademy(academy.id, "LEARNER");

  return (
    <PortalShell
      brandName={academy.logo_text}
      brandTag="Instructor"
      themeStyle={themeVars(template)}
      navItems={INSTRUCTOR_NAV(slug)}
      activeHref={`/a/${slug}/instructor`}
      userName={session.name}
      userRoleLabel="Instructor"
      logoutRedirect={`/a/${slug}/login`}
      trialBanner={<TrialBanner academy={academy} slug={slug} showManage={false} />}
    >
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Welcome, {session.name.split(" ")[0]}</h1>
      <p className="text-gray-500 mb-8">Manage your courses, modules, and learners for {academy.name}.</p>

      <div className="grid grid-cols-3 gap-4 mb-10">
        <div className="app-card p-5">
          <div className="text-2xl font-bold text-gray-900">{courses.length}</div>
          <div className="text-xs text-gray-500 mt-1">Courses</div>
        </div>
        <div className="app-card p-5">
          <div className="text-2xl font-bold text-gray-900">{modules.length}</div>
          <div className="text-xs text-gray-500 mt-1">Modules</div>
        </div>
        <div className="app-card p-5">
          <div className="text-2xl font-bold text-gray-900">{learners.length}</div>
          <div className="text-xs text-gray-500 mt-1">Learners</div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <Link href={`/a/${slug}/instructor/courses`} className="app-btn-primary rounded-md px-4 py-3 text-sm font-semibold text-center">
          + Create a course
        </Link>
        <Link href={`/a/${slug}/instructor/modules`} className="rounded-md px-4 py-3 text-sm font-semibold text-center border border-gray-300 text-gray-700 hover:bg-gray-50">
          + Create a module
        </Link>
        <Link href={`/a/${slug}/instructor/learners`} className="rounded-md px-4 py-3 text-sm font-semibold text-center border border-gray-300 text-gray-700 hover:bg-gray-50">
          + Add a learner
        </Link>
      </div>

      <div className="app-card p-6 mt-8">
        <h2 className="font-semibold text-gray-900 mb-4">Recent Courses</h2>
        <div className="space-y-2">
          {courses.slice(0, 6).map((c) => (
            <Link key={c.id} href={`/a/${slug}/instructor/courses/${c.id}`} className="flex items-center justify-between border-b border-gray-100 py-2.5 last:border-0 text-sm">
              <span>
                {c.cover_emoji} {c.title}
              </span>
              <span className={`text-xs px-2 py-1 rounded-full font-semibold ${c.is_published ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                {c.is_published ? "Published" : "Draft"}
              </span>
            </Link>
          ))}
          {courses.length === 0 && <p className="text-sm text-gray-500">No courses yet.</p>}
        </div>
      </div>
    </PortalShell>
  );
}
