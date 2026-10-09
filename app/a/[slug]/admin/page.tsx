import { notFound } from "next/navigation";
import Link from "next/link";
import { Academies, Templates, Users, Courses, Payments, Plans } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { themeVars } from "@/lib/theme";
import { formatGBP, formatDate } from "@/lib/utils";
import PortalShell from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import { ADMIN_NAV } from "@/lib/nav";

export default async function AdminDashboard({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { slug } = await params;
  const { welcome } = await searchParams;
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const template = (await Templates.byId(academy.template_id))!;
  const plan = (await Plans.byId(academy.plan_id))!;

  const learners = await Users.listByAcademy(academy.id, "LEARNER");
  const instructors = await Users.listByAcademy(academy.id, "INSTRUCTOR");
  const courses = await Courses.listByAcademy(academy.id);
  const payments = (await Payments.listByAcademy(academy.id)) as { amount_pence: number }[];
  const revenue = payments.reduce((sum, p) => sum + p.amount_pence, 0);

  return (
    <PortalShell
      brandName={academy.logo_text}
      brandTag="Academy Admin"
      themeStyle={themeVars(template)}
      navItems={ADMIN_NAV(slug)}
      activeHref={`/a/${slug}/admin`}
      userName={session.name}
      userRoleLabel="Academy Admin"
      logoutRedirect={`/a/${slug}/login`}
      trialBanner={<TrialBanner academy={academy} slug={slug} showManage />}
    >
      {welcome && (
        <div className="mb-6 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 px-5 py-4 text-sm">
          🎉 Your academy is live! Add instructors and courses to get started.
        </div>
      )}
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Welcome back, {session.name.split(" ")[0]}</h1>
      <p className="text-gray-500 mb-8">Here&apos;s how {academy.name} is doing.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <StatCard label="Learners" value={learners.length} />
        <StatCard label="Instructors" value={instructors.length} />
        <StatCard label="Courses" value={courses.length} />
        <StatCard label="Revenue" value={formatGBP(revenue)} />
      </div>

      <div className="app-card p-5 mb-8 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🌐</span>
          <div>
            <div className="text-sm font-semibold text-gray-900">
              Academy site {academy.is_published ? "is live" : "isn't published yet"}
            </div>
            <div className="text-xs text-gray-500">
              {academy.is_published
                ? `Visible to anyone at skillsacademy.ai/a/${academy.slug}`
                : "Preview and publish your public academy page any time."}
            </div>
          </div>
        </div>
        <Link href={`/a/${slug}/admin/site`} className="app-btn-primary rounded-md px-4 py-2 text-sm font-semibold">
          Manage Academy Site
        </Link>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="app-card p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Your Plan</h2>
          <div className="text-sm text-gray-600 space-y-2">
            <div className="flex justify-between">
              <span>Plan</span>
              <span className="font-semibold text-gray-900">{plan.name}</span>
            </div>
            <div className="flex justify-between">
              <span>Price</span>
              <span className="font-semibold text-gray-900">{formatGBP(plan.price_pence)}/mo</span>
            </div>
            <div className="flex justify-between">
              <span>Status</span>
              <span className="font-semibold capitalize text-gray-900">{academy.subscription_status}</span>
            </div>
            <div className="flex justify-between">
              <span>Trial ends</span>
              <span className="font-semibold text-gray-900">{formatDate(academy.trial_ends_at)}</span>
            </div>
          </div>
          <Link href={`/a/${slug}/admin/billing`} className="app-link text-sm font-semibold inline-block mt-4">
            Manage billing →
          </Link>
        </div>

        <div className="app-card p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid gap-3">
            <Link href={`/a/${slug}/admin/people`} className="app-btn-primary rounded-md px-4 py-2.5 text-sm font-semibold text-center">
              Invite instructors &amp; learners
            </Link>
            <Link href={`/a/${slug}/admin/courses`} className="rounded-md px-4 py-2.5 text-sm font-semibold text-center border border-gray-300 text-gray-700 hover:bg-gray-50">
              Review courses
            </Link>
            <Link href={`/a/${slug}/admin/branding`} className="rounded-md px-4 py-2.5 text-sm font-semibold text-center border border-gray-300 text-gray-700 hover:bg-gray-50">
              Change design template
            </Link>
          </div>
        </div>
      </div>
    </PortalShell>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="app-card p-5">
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}
