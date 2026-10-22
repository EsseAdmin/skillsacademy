import { requireSuperAdminSession } from "@/lib/authz";
import { SubscriptionInvoices } from "@/lib/queries";
import { getStripeClient } from "@/lib/stripe";
import { formatGBP, formatDate } from "@/lib/utils";
import PortalShell from "@/components/PortalShell";
import { SUPER_ADMIN_NAV } from "@/lib/nav";

const THEME = { ["--brand-primary" as never]: "#0B1F3B", ["--brand-secondary" as never]: "#12294d", ["--brand-accent" as never]: "#FBCB07" };

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    paid: "bg-emerald-50 text-emerald-700",
    in_transit: "bg-amber-50 text-amber-700",
    pending: "bg-amber-50 text-amber-700",
    failed: "bg-red-50 text-red-700",
    canceled: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ${styles[status] || "bg-gray-100 text-gray-500"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

export default async function PayoutsPage() {
  const session = await requireSuperAdminSession();
  const totalCollectedPence = await SubscriptionInvoices.totalCollected("stripe");

  const stripe = getStripeClient();

  return (
    <PortalShell
      brandName="SkillsAcademy.ai"
      brandTag="Platform Admin"
      themeStyle={THEME}
      navItems={SUPER_ADMIN_NAV}
      activeHref="/super-admin/payouts"
      userName={session.name}
      userRoleLabel="Super Admin"
      logoutRedirect="/super-admin/login"
    >
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Payouts</h1>
      <p className="text-gray-500 text-sm mb-8">
        Where academy subscription money goes, and how it reaches your real business bank account.
      </p>

      <div className="app-card p-6 mb-8">
        <div className="text-xs text-gray-500 mb-1">Total real subscription revenue collected via Stripe</div>
        <div className="text-2xl font-bold text-gray-900">{formatGBP(totalCollectedPence)}</div>
        <p className="text-xs text-gray-400 mt-2">
          Sum of every real (non-simulated) subscription invoice paid across all academies. This is bookkeeping from this
          app&apos;s own records, not a live read of your Stripe balance — see below for that.
        </p>
      </div>

      {!stripe ? (
        <div className="app-card p-6">
          <h2 className="font-semibold text-gray-900 mb-2">Stripe isn&apos;t connected yet</h2>
          <p className="text-sm text-gray-600 mb-4">
            Academy subscription payments and payouts to your bank both go through Stripe, and no <code>STRIPE_SECRET_KEY</code>{" "}
            is configured on this deployment yet. To start receiving real money:
          </p>
          <ol className="text-sm text-gray-600 list-decimal list-inside space-y-2 mb-4">
            <li>
              Create a Stripe account for your business at{" "}
              <a href="https://dashboard.stripe.com/register" target="_blank" rel="noreferrer" className="app-link">
                dashboard.stripe.com/register
              </a>{" "}
              and complete their business verification (identity, company details) — this has to be done by you directly with
              Stripe; it can&apos;t be completed on your behalf.
            </li>
            <li>
              Add your real bank account under Stripe&apos;s own{" "}
              <a href="https://dashboard.stripe.com/settings/payouts" target="_blank" rel="noreferrer" className="app-link">
                Settings → Payouts
              </a>{" "}
              page, and set the <strong>payout schedule to Monthly</strong>. Your bank details are entered directly into
              Stripe&apos;s secure form there — this app never asks for or stores them.
            </li>
            <li>
              Add <code>STRIPE_SECRET_KEY</code> (and <code>STRIPE_WEBHOOK_SECRET</code>, after registering a webhook endpoint
              pointed at <code>/api/webhooks/stripe</code>) as environment variables for this site — see{" "}
              <code>DEPLOYMENT.md</code>.
            </li>
            <li>
              Come back to <a href="/super-admin/plans" className="app-link">Subscription Plans</a> and click{" "}
              <strong>Sync plans to Stripe</strong> so academies have something real to pay for.
            </li>
          </ol>
        </div>
      ) : (
        <StripeAccountStatus />
      )}
    </PortalShell>
  );
}

// Split out so a Stripe API error (e.g. an invalid/revoked key, or a
// transient network issue) shows a clear message on this one section
// instead of taking down the whole page.
async function StripeAccountStatus() {
  const stripe = getStripeClient()!;

  let balance: Awaited<ReturnType<typeof stripe.balance.retrieve>> | null = null;
  let payouts: Awaited<ReturnType<typeof stripe.payouts.list>> | null = null;
  let account: Awaited<ReturnType<typeof stripe.accounts.retrieveCurrent>> | null = null;
  let fetchError: string | null = null;

  try {
    [balance, payouts, account] = await Promise.all([
      stripe.balance.retrieve(),
      stripe.payouts.list({ limit: 10 }),
      stripe.accounts.retrieveCurrent(),
    ]);
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Couldn't reach Stripe.";
  }

  if (fetchError) {
    return (
      <div className="app-card p-6">
        <h2 className="font-semibold text-gray-900 mb-2">Couldn&apos;t load your Stripe account</h2>
        <p className="text-sm text-red-600">{fetchError}</p>
        <p className="text-xs text-gray-500 mt-2">
          Double-check <code>STRIPE_SECRET_KEY</code> is a valid, current key for your Stripe account.
        </p>
      </div>
    );
  }

  const scheduleInterval = account?.settings?.payouts?.schedule?.interval;
  const payoutsEnabled = account?.payouts_enabled;

  return (
    <>
      <div className="app-card p-6 mb-8">
        <h2 className="font-semibold text-gray-900 mb-4">Your Stripe balance</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-gray-500 mb-1">Available now</div>
            <div className="text-xl font-bold text-gray-900">
              {balance ? formatGBP(balance.available.reduce((sum, b) => sum + b.amount, 0)) : "—"}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Pending (still clearing)</div>
            <div className="text-xl font-bold text-gray-900">
              {balance ? formatGBP(balance.pending.reduce((sum, b) => sum + b.amount, 0)) : "—"}
            </div>
          </div>
        </div>
      </div>

      <div className="app-card p-6 mb-8">
        <h2 className="font-semibold text-gray-900 mb-1">Payout schedule</h2>
        <p className="text-xs text-gray-500 mb-4">
          Set directly in Stripe, not in this app —{" "}
          <a href="https://dashboard.stripe.com/settings/payouts" target="_blank" rel="noreferrer" className="app-link">
            open Stripe Settings → Payouts
          </a>{" "}
          to change it.
        </p>
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <div className="text-xs text-gray-500 mb-1">Current schedule</div>
            <div className="text-lg font-semibold capitalize text-gray-900">{scheduleInterval || "Unknown"}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Payouts enabled</div>
            <div className="text-lg font-semibold text-gray-900">{payoutsEnabled ? "Yes" : "Not yet — finish verification in Stripe"}</div>
          </div>
        </div>
        {scheduleInterval && scheduleInterval !== "monthly" && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-4">
            Your payout schedule is currently <strong>{scheduleInterval}</strong>, not monthly. Change it in the Stripe
            Dashboard link above if you want payouts to your bank once a month instead.
          </p>
        )}
      </div>

      <div className="app-card p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Recent payouts to your bank</h2>
        <div className="space-y-2">
          {payouts?.data.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-sm border-b border-gray-100 pb-2 last:border-0">
              <span>{formatDate(new Date(p.arrival_date * 1000).toISOString())}</span>
              {statusBadge(p.status)}
              <span className="font-semibold text-gray-900">{formatGBP(p.amount)}</span>
            </div>
          ))}
          {(!payouts || payouts.data.length === 0) && <p className="text-sm text-gray-500">No payouts yet.</p>}
        </div>
      </div>
    </>
  );
}
