import { requireSuperAdminSession } from "@/lib/authz";
import { Plans } from "@/lib/queries";
import PortalShell from "@/components/PortalShell";
import { SUPER_ADMIN_NAV } from "@/lib/nav";
import { checkResendDomains, checkStripe } from "@/lib/healthChecks";
import { recentIntegrationEvents } from "@/lib/integrationLog";
import { priceBelowStripeMinimum, STRIPE_MIN_GBP_PENCE } from "@/lib/stripe";
import { formatGBP } from "@/lib/utils";
import { TestEmailForm, TestCheckoutForm } from "@/components/HealthTools";

const THEME = { ["--brand-primary" as never]: "#0B1F3B", ["--brand-secondary" as never]: "#12294d", ["--brand-accent" as never]: "#FBCB07" };

function Pill({ ok, children }: { ok: boolean | "warn"; children: React.ReactNode }) {
  const cls = ok === true ? "bg-emerald-50 text-emerald-700" : ok === "warn" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700";
  return <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ${cls}`}>{children}</span>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-1 py-2 border-b border-gray-100 last:border-0 text-sm">
      <div className="w-52 shrink-0 text-gray-500">{label}</div>
      <div className="min-w-0 flex-1 text-gray-900 break-words">{children}</div>
    </div>
  );
}

export default async function SystemCheckPage() {
  const session = await requireSuperAdminSession();
  const from = process.env.EMAIL_FROM || "SkillsAcademy.ai <no-reply@skillacademies.ai>";
  const [domains, stripe, plans, events] = await Promise.all([
    checkResendDomains(from),
    checkStripe(),
    Plans.all(true),
    recentIntegrationEvents(40),
  ]);
  const keySet = !!process.env.RESEND_API_KEY;
  const badPlans = plans.filter((p) => priceBelowStripeMinimum(p.price_pence));

  return (
    <PortalShell
      brandName="SkillsAcademy.ai"
      brandTag="Platform Admin"
      themeStyle={THEME}
      navItems={SUPER_ADMIN_NAV}
      activeHref="/super-admin/health"
      userName={session.name}
      userRoleLabel="Super Admin"
      logoutRedirect="/super-admin/login"
    >
      <h1 className="text-2xl font-bold text-gray-900 mb-1">System check</h1>
      <p className="text-gray-500 text-sm mb-8">
        Whether email and card payments are really working, with the exact answer from Resend and Stripe when they aren&apos;t. Secrets are never shown.
      </p>

      <div className="app-card p-6 mb-8">
        <h2 className="font-semibold text-gray-900 mb-2">Email (verification and password-reset emails)</h2>
        <Row label="RESEND_API_KEY">{keySet ? <Pill ok>Set</Pill> : <Pill ok={false}>Not set — no email can be sent</Pill>}</Row>
        <Row label="Sending as">
          <code>{from}</code>
        </Row>
        <Row label="Sender domain">
          {domains.status === "ok" ? (
            domains.fromDomainStatus === "verified" ? (
              <Pill ok>{domains.fromDomain} verified</Pill>
            ) : domains.fromDomainStatus ? (
              <>
                <Pill ok={false}>
                  {domains.fromDomain}: {domains.fromDomainStatus}
                </Pill>{" "}
                Resend won&apos;t send from a domain that isn&apos;t verified — finish the DNS records in the Resend dashboard.
              </>
            ) : (
              <>
                <Pill ok={false}>{domains.fromDomain} isn&apos;t in your Resend account</Pill> Add and verify it in Resend, or set EMAIL_FROM to an address on a
                domain you have verified ({domains.domains?.map((d) => d.name).join(", ") || "none yet"}).
              </>
            )
          ) : (
            <>
              <Pill ok={domains.status === "limited" ? "warn" : false}>{domains.status === "limited" ? "Can't check" : "Problem"}</Pill> {domains.note}
            </>
          )}
        </Row>
        <div className="mt-4">
          <TestEmailForm to={session.email} />
        </div>
      </div>

      <div className="app-card p-6 mb-8">
        <h2 className="font-semibold text-gray-900 mb-2">Card payments (Stripe)</h2>
        <Row label="STRIPE_SECRET_KEY">
          {stripe.configured ? <Pill ok>Set ({stripe.mode})</Pill> : <Pill ok={false}>Not set — checkout is disabled</Pill>}
        </Row>
        <Row label="STRIPE_WEBHOOK_SECRET">
          {stripe.webhookSecretSet ? <Pill ok>Set</Pill> : <Pill ok={false}>Not set — subscriptions won&apos;t update after payment</Pill>}
        </Row>
        {stripe.configured && (
          <Row label="Stripe account">
            {stripe.error ? (
              <>
                <Pill ok={false}>Stripe refused</Pill> {stripe.error}
              </>
            ) : stripe.account ? (
              <div className="grid gap-1">
                <div>
                  Can take payments: {stripe.account.chargesEnabled ? <Pill ok>Yes</Pill> : <Pill ok={false}>No</Pill>} · Payouts to your bank:{" "}
                  {stripe.account.payoutsEnabled ? <Pill ok>Yes</Pill> : <Pill ok="warn">Not yet</Pill>} · Business details submitted:{" "}
                  {stripe.account.detailsSubmitted ? <Pill ok>Yes</Pill> : <Pill ok={false}>No</Pill>}
                </div>
                {stripe.account.disabledReason && <div className="text-red-700">Stripe says this account is restricted: {stripe.account.disabledReason}</div>}
                {stripe.account.currentlyDue.length > 0 && (
                  <div className="text-amber-800">
                    Stripe still needs from you: {stripe.account.currentlyDue.join(", ")} (complete these in the Stripe Dashboard).
                  </div>
                )}
              </div>
            ) : null}
          </Row>
        )}
        <Row label="Plan prices">
          <div className="grid gap-1">
            {plans.map((p) => (
              <div key={p.id}>
                {p.name} — {formatGBP(p.price_pence)}/month{" "}
                {priceBelowStripeMinimum(p.price_pence) ? (
                  <Pill ok={false}>Below Stripe&apos;s {STRIPE_MIN_GBP_PENCE}p minimum — checkout fails</Pill>
                ) : (
                  <Pill ok>OK</Pill>
                )}{" "}
                {p.stripe_price_id ? <span className="text-gray-400 text-xs">synced</span> : <span className="text-gray-400 text-xs">not synced yet</span>}
              </div>
            ))}
          </div>
        </Row>
        {badPlans.length > 0 && (
          <p className="mt-2 text-sm text-red-700">
            Fix: open <a href="/super-admin/plans" className="app-link">Subscription Plans</a>, set {badPlans.map((p) => p.name).join(", ")} to at least £0.30, save, then press Sync plans to Stripe.
          </p>
        )}
        {stripe.configured && plans.length > 0 && (
          <div className="mt-4">
            <TestCheckoutForm plans={plans.map((p) => ({ id: p.id, name: p.name, price: formatGBP(p.price_pence) }))} />
          </div>
        )}
      </div>

      <div className="app-card p-6">
        <h2 className="font-semibold text-gray-900 mb-1">Recent email and Stripe activity</h2>
        <p className="text-xs text-gray-500 mb-4">Newest first. Failures show the provider&apos;s own error message.</p>
        {events.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing recorded yet. Send a test email above, or have someone sign up or try checkout.</p>
        ) : (
          <div className="grid gap-2">
            {events.map((e) => (
              <div key={e.id} className="text-sm border-b border-gray-100 pb-2 last:border-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill ok={e.level === "info"}>{e.kind}</Pill>
                  <span className="text-gray-400 text-xs">{new Date(e.created_at).toLocaleString("en-GB")}</span>
                  <span className={e.level === "error" ? "text-red-700" : "text-gray-800"}>{e.message}</span>
                </div>
                {e.detail && <div className="text-xs text-gray-500 mt-1 break-words">{e.detail}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
