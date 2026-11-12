import { notFound } from "next/navigation";
import { Academies, Templates, Plans, SubscriptionInvoices } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { themeVars } from "@/lib/theme";
import { formatGBP, formatDate, formatDateTime, isTrialActive, daysRemaining } from "@/lib/utils";
import PortalShell from "@/components/PortalShell";
import { complimentaryState } from "@/lib/complimentary";
import TrialBanner from "@/components/TrialBanner";
import { ADMIN_NAV } from "@/lib/nav";
import { subscribeAcademy, changePlanTrial, manageBilling, requestCancellation, withdrawCancellation } from "@/lib/actions/billing";
import CancelSubscriptionForm from "@/components/CancelSubscriptionForm";
import WithdrawCancellationButton from "@/components/WithdrawCancellationButton";
import SubscribeForm from "@/components/SubscribeForm";
import ManageBillingButton from "@/components/ManageBillingButton";

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ updated?: string; canceled?: string; cancellation?: string }>;
}) {
  const { slug } = await params;
  const { updated, canceled, cancellation } = await searchParams;
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const template = (await Templates.byId(academy.template_id))!;
  const currentPlan = (await Plans.byId(academy.plan_id))!;
  const plans = await Plans.all(true);
  const invoices = await SubscriptionInvoices.listByAcademy(academy.id);

  const trialActive = isTrialActive(academy.trial_ends_at);
  const comp = complimentaryState(academy);
  const boundSubscribe = subscribeAcademy.bind(null, slug);
  const boundChangeTrial = changePlanTrial.bind(null, slug);
  const boundManageBilling = manageBilling.bind(null, slug);
  const boundCancel = requestCancellation.bind(null, slug);
  const boundWithdraw = withdrawCancellation.bind(null, slug);
  const cancelRequested = !!academy.cancellation_requested_at;
  const hasPaidSubscription = !!academy.stripe_subscription_id && academy.subscription_status !== "canceled";

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

      {cancellation === "requested" && (
        <div className="mb-6 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 px-5 py-4 text-sm" data-testid="cancel-received">
          ✅ Your cancellation request has been sent. No further payments will be taken, and we&apos;ve emailed you a confirmation.
        </div>
      )}
      {cancellation === "withdrawn" && (
        <div className="mb-6 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 px-5 py-4 text-sm" data-testid="cancel-withdrawn">
          ✅ Your cancellation request has been withdrawn. Your subscription is back on.
        </div>
      )}

      {cancelRequested && (
        <div className="mb-8 rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-900" data-testid="cancel-pending">
          <div className="font-semibold mb-1">Cancellation requested on {formatDate(academy.cancellation_requested_at!)}</div>
          <p className="mb-3">
            {academy.cancellation_billing === "stopped"
              ? "Your subscription has been switched off — no further payments will be taken."
              : "You were on the free trial, so no payment will be taken."}{" "}
            Your academy will be archived automatically on <strong>{formatDateTime(academy.cancellation_archive_at ?? academy.cancellation_requested_at!)}</strong> (24 hours
            after your request): it will be hidden from your learners and staff, and the platform team will then delete it. Changed your mind? Withdraw the request before then.
          </p>
          <WithdrawCancellationButton action={boundWithdraw} />
        </div>
      )}

      {canceled && (
        <div className="mb-6 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-5 py-4 text-sm">
          Checkout was canceled — no payment was taken. You can try again below whenever you&apos;re ready.
        </div>
      )}

      {comp.active && (
        <div className="mb-8 rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900" data-testid="complimentary-card">
          <div className="font-semibold mb-1">Complimentary access</div>
          <p>
            {comp.unlimited
              ? "Your academy has been given free access with no end date, so there is nothing to pay."
              : `Your academy has been given free access until ${formatDate(comp.until!)}, so there is nothing to pay until then.`}
            {" "}Your plan&apos;s limits still apply; the platform team manages your plan while access is complimentary.
          </p>
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
              {comp.active
                ? "Complimentary"
                : academy.subscription_status === "trialing"
                ? trialActive
                  ? `Trial (${daysRemaining(academy.trial_ends_at)} days left)`
                  : "Trial ended"
                : academy.subscription_status}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">{comp.active ? "Free access until" : "Trial ends"}</div>
            <div className="text-sm font-semibold text-gray-900">{comp.active ? (comp.unlimited ? "No end date" : formatDate(comp.until!)) : formatDate(academy.trial_ends_at)}</div>
          </div>
        </div>
      </div>

      {!cancelRequested && !comp.active && academy.subscription_status === "trialing" && trialActive && (
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

      {!cancelRequested && academy.subscription_status === "active" && academy.stripe_customer_id && (
        <div className="app-card p-6 mb-8">
          <h2 className="font-semibold text-gray-900 mb-1">Manage your subscription</h2>
          <p className="text-xs text-gray-500 mb-4">Update your card, view Stripe&apos;s own invoices, or cancel — via Stripe&apos;s secure billing portal.</p>
          <ManageBillingButton action={boundManageBilling} />
        </div>
      )}

      {!cancelRequested && !comp.active && (
      <div className="app-card p-6 mb-8">
        <h2 className="font-semibold text-gray-900 mb-1">
          {academy.subscription_status === "active" ? "Change plan" : "Activate your subscription"}
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          {academy.subscription_status === "active"
            ? "Switching plans starts a new checkout — billed monthly via Stripe."
            : "Choose a plan and continue to Stripe's secure checkout, or continue on your free trial until it ends."}
        </p>
        <SubscribeForm action={boundSubscribe} plans={plans} defaultPlanKey={currentPlan.key} />
      </div>
      )}

      <div className="app-card p-6 mb-8">
        <h2 className="font-semibold text-gray-900 mb-4">Invoice history</h2>
        <div className="space-y-2">
          {invoices.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between text-sm border-b border-gray-100 pb-2 last:border-0">
              <span>{formatDate(inv.created_at)}</span>
              <span className="capitalize text-emerald-600 font-medium">{inv.status}</span>
              <span className="font-semibold text-gray-900">{formatGBP(inv.amount_pence)}</span>
              <span
                className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ${
                  inv.provider === "stripe" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"
                }`}
              >
                {inv.provider === "stripe" ? "Real payment" : "Simulated"}
              </span>
            </div>
          ))}
          {invoices.length === 0 && <p className="text-sm text-gray-500">No invoices yet.</p>}
        </div>
      </div>

      {!cancelRequested && (
        <div className="app-card p-6 border border-red-200">
          <h2 className="font-semibold text-red-700 mb-3">Cancel subscription &amp; delete academy</h2>
          <CancelSubscriptionForm action={boundCancel} academyName={academy.name} hasPaidSubscription={hasPaidSubscription} />
        </div>
      )}
    </PortalShell>
  );
}
