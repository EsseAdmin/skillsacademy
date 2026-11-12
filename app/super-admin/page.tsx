import { requireSuperAdminSession } from "@/lib/authz";
import { archiveDueAcademies } from "@/lib/archiveCancelled";
import { Academies, Plans, Users } from "@/lib/queries";
import Link from "next/link";
import { formatGBP, formatDate, formatDateTime, daysRemaining, isTrialActive } from "@/lib/utils";
import PortalShell from "@/components/PortalShell";
import { SUPER_ADMIN_NAV } from "@/lib/nav";
import { saHref } from "@/lib/superAdminPath";
import { isComplimentaryActive } from "@/lib/complimentary";

export default async function SuperAdminDashboard() {
  const session = await requireSuperAdminSession();
  await archiveDueAcademies().catch(() => undefined);
  const academies = await Academies.all();

  // Complimentary academies pay nothing, so they count under their own heading, not as trials or revenue.
  const free = academies.filter((a) => isComplimentaryActive(a));
  const paying = academies.filter((a) => !isComplimentaryActive(a));
  const trialing = paying.filter((a) => a.subscription_status === "trialing");
  const active = paying.filter((a) => a.subscription_status === "active");
  const cancelling = academies.filter((a) => a.cancellation_requested_at);
  // An academy that has asked to cancel won't renew, so it isn't recurring revenue.
  const activePlans = await Promise.all(active.filter((a) => !a.cancellation_requested_at).map((a) => Plans.byId(a.plan_id)));
  const mrr = activePlans.reduce((sum, plan) => sum + (plan?.price_pence || 0), 0);
  const endingSoon = trialing.filter((a) => isTrialActive(a.trial_ends_at) && daysRemaining(a.trial_ends_at) <= 3);
  const learnersByAcademy = await Promise.all(academies.map((a) => Users.listByAcademy(a.id, "LEARNER")));
  const totalLearners = learnersByAcademy.reduce((sum, learners) => sum + learners.length, 0);
  const allAcademiesIncludingDeleted = await Academies.all(true);

  return (
    <PortalShell
      brandName="SkillsAcademy.ai"
      brandTag="Platform Admin"
      themeStyle={{ ["--brand-primary" as never]: "#0B1F3B", ["--brand-secondary" as never]: "#12294d", ["--brand-accent" as never]: "#FBCB07" }}
      navItems={SUPER_ADMIN_NAV()}
      activeHref={saHref("/super-admin")}
      userName={session.name}
      userRoleLabel="Super Admin"
      logoutRedirect={saHref("/super-admin/login")}
    >
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Platform Overview</h1>
      <p className="text-gray-500 mb-8">Every academy running on SkillsAcademy.ai.</p>

      {cancelling.length > 0 && (
        <div className="mb-8 rounded-lg border border-red-200 bg-red-50 px-5 py-4" data-testid="cancel-requests-card">
          <h2 className="font-semibold text-red-800 mb-2">
            {cancelling.length} cancellation &amp; deletion request{cancelling.length === 1 ? "" : "s"} waiting
          </h2>
          <div className="space-y-1.5 text-sm text-red-900">
            {cancelling.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-4">
                <span className="font-medium">{a.name}</span>
                <span className="text-xs">requested {formatDate(a.cancellation_requested_at!)} · archives {formatDateTime(a.cancellation_archive_at ?? a.cancellation_requested_at!)}</span>
              </div>
            ))}
          </div>
          <Link href={saHref("/super-admin/academies")} className="text-sm font-semibold underline text-red-800 inline-block mt-3">
            Review →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
        <Stat label="Total Academies" value={academies.length} />
        <Stat label="Active Subscriptions" value={active.length} />
        <Stat label="On Free Trial" value={trialing.length} />
        <Stat label="Complimentary" value={free.length} />
        <Stat label="Est. MRR" value={formatGBP(mrr)} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="app-card p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Trials ending soon</h2>
          <div className="space-y-3">
            {endingSoon.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-sm border-b border-gray-100 pb-2 last:border-0">
                <span className="font-medium text-gray-900">{a.name}</span>
                <span className="text-amber-600 font-semibold">{daysRemaining(a.trial_ends_at)}d left</span>
              </div>
            ))}
            {endingSoon.length === 0 && <p className="text-sm text-gray-500">No trials ending in the next 3 days.</p>}
          </div>
        </div>
        <div className="app-card p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Platform totals</h2>
          <div className="text-sm text-gray-600 space-y-2">
            <div className="flex justify-between">
              <span>Total learners across all academies</span>
              <span className="font-semibold text-gray-900">{totalLearners}</span>
            </div>
            <div className="flex justify-between">
              <span>Deleted academies</span>
              <span className="font-semibold text-gray-900">{allAcademiesIncludingDeleted.length - academies.length}</span>
            </div>
          </div>
        </div>
      </div>
    </PortalShell>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="app-card p-5">
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}
