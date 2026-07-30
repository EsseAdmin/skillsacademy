import { notFound } from "next/navigation";
import { Academies, Templates, Plans, SubscriptionInvoices } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { themeVars } from "@/lib/theme";
import { formatGBP, formatDate, isTrialActive, daysRemaining } from "@/lib/utils";
import PortalShell from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import { ADMIN_NAV } from "@/lib/nav";
import { subscribeAcademy, changePlanTrial } from "@/lib/actions/billing";
import SubscribeForm from "@/components/SubscribeForm";

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ updated?: string }>;
}) {
  const { slug } = await params;
  const { updated } = await searchParams;
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const template = (await Templates.byId(academy.template_id))!;
  const currentPlan = (await Plans.byId(academy.plan_id))!;
  const plans = await Plans.all(true);
  const invoices = (await SubscriptionInvoices.listByAcademy(academy.id)) as {
    id: string;
    amount_pence: number;
    status: string;
    period_start: string;
    created_at: string;
  }[];

  const trialActive = isTrialActive(academy.trial_ends_at);
  const boundSubscribe = subscribeAcademy.bind(null, slug);
  const boundChangeTrial = changePlanTrial.bind(null, slug);

  return (
    <PortalShell
      brandName={academy.logo_text}
      brandTag="Academy Admin"
      themeStyle={themeVars(template)}
      navItems={ADMIN_NAV(slug)}
      activeHref={`/a/${slug}/admin/billing`}
      userName={session.name}
      userRoleLabel="Academy Admin"
      logoutRedirect={`/a/${slug}/login`}
      trialBanner={<TrialBanner academy={academy} slug={slug} showManage={false} />}
    >
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Billing &amp; Subscription</h1>
      <p className="text-gray-500 text-sm mb-8">Manage your SkillsAcademy.ai subscription.</p>

      {updated && (
        <div className="mb-6 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 px-5 py-4 text-sm">
          ✅ Subscription updated successfully.
        </div>
      )}

      <div className="app-card p-6 mb-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs text-gray-500 mb-1">Current plan</div>
            <div className="text-xl font-bold text-gray-900">{currentPlan.name} — {formatGBP(currentPlan.price_pence)}/mo</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Status</div>
            <div className="text-lg font-semibold capitalize text-gray-900">
              {academy.subscription_status === "trialing"
                ? trialActive
                  ? `Trial (${daysRemaining(academy.trial_ends_at)} days left)`
                  : "Trial ended"
                : academy.subscription_status}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Trial ends</div>
            <div className="text-sm font-semibold text-gray-900">{formatDate(academy.trial_ends_at)}</div>
          </div>
        </div>
      </div>

      {academy.subscription_status === "trialing" && trialActive && (
        <div className="app-card p-6 mb-8">
          <h2 className="font-semibold text-gray-900 mb-4">Switch plan (still free during trial)</h2>
          <form action={boundChangeTrial} className="flex gap-3 items-end">
            <select name="plan" defaultValue={currentPlan.key} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
              {plans.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name} — {formatGBP(p.price_pence)}/mo
                </option>
              ))}
            </select>
            <button type="submit" className="rounded-md px-4 py-2 text-sm font-semibold border border-gray-300 hover:bg-gray-50">
              Switch Plan
            </button>
          </form>
        </div>
      )}

      <div className="app-card p-6 mb-8">
        <h2 className="font-semibold text-gray-900 mb-1">
          {academy.subscription_status === "active" ? "Change plan / update payment" : "Activate your subscription"}
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          {academy.subscription_status === "active"
            ? "Update your card details or switch plans — billed monthly."
            : "Add payment details now, or continue on your free trial until it ends. This is a simulated checkout."}
        </p>
        <SubscribeForm action={boundSubscribe} plans={plans} defaultPlanKey={currentPlan.key} />
      </div>

      <div className="app-card p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Invoice history</h2>
        <div className="space-y-2">
          {invoices.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between text-sm border-b border-gray-100 pb-2 last:border-0">
              <span>{formatDate(inv.created_at)}</span>
              <span className="capitalize text-emerald-600 font-medium">{inv.status}</span>
              <span className="font-semibold text-gray-900">{formatGBP(inv.amount_pence)}</span>
            </div>
          ))}
          {invoices.length === 0 && <p className="text-sm text-gray-500">No invoices yet.</p>}
        </div>
      </div>
    </PortalShell>
  );
}
