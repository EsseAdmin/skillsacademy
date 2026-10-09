"use server";

import { requireSuperAdminSession } from "@/lib/authz";
import { Plans } from "@/lib/queries";
import { sendEmail } from "@/lib/email";
import { getStripeClient, ensureStripePrice, priceBelowStripeMinimum, stripeErrorLine, STRIPE_MIN_GBP_PENCE } from "@/lib/stripe";
import { logIntegrationEvent } from "@/lib/integrationLog";
import { currentOrigin } from "@/lib/requestOrigin";

export type HealthActionState = { ok?: boolean; message?: string; url?: string } | undefined;

// Sends one real email to the signed-in super admin's own address (never to
// an address typed into a form, so this can't be used as an open relay) and
// reports exactly what the email provider answered.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState always calls with (prevState, formData); this action needs neither.
export async function sendTestEmail(_prev: HealthActionState, _formData: FormData): Promise<HealthActionState> {
  const session = await requireSuperAdminSession();
  const when = new Date().toISOString();
  const result = await sendEmail({
    to: session.email,
    subject: "SkillsAcademy.ai test email",
    text: `This is a test email from the System check page, sent ${when}. If you can read this, verification and password-reset emails can be delivered.`,
    html: `<p>This is a test email from the <strong>System check</strong> page, sent ${when}.</p><p>If you can read this, verification and password-reset emails can be delivered.</p>`,
  });
  if (result.ok) {
    return { ok: true, message: `Resend accepted the email for ${session.email}. Check that inbox (and spam). If it never arrives, the problem is delivery or the sender domain, not the app.` };
  }
  return { ok: false, message: result.error || "Sending failed." };
}

// Creates (and does not complete) a real Stripe Checkout Session for the
// chosen plan, so the platform admin sees Stripe's actual answer — success,
// or the exact reason it refuses — without needing an academy to try it.
export async function testStripeCheckout(_prev: HealthActionState, formData: FormData): Promise<HealthActionState> {
  const session = await requireSuperAdminSession();
  const planId = String(formData.get("planId") || "");
  const plan = (await Plans.all(true)).find((p) => p.id === planId);
  if (!plan) return { ok: false, message: "Choose a plan first." };

  const stripe = getStripeClient();
  if (!stripe) return { ok: false, message: "STRIPE_SECRET_KEY isn't set on this deployment." };
  if (priceBelowStripeMinimum(plan.price_pence)) {
    return { ok: false, message: `"${plan.name}" is priced at ${plan.price_pence}p. Stripe's minimum is ${STRIPE_MIN_GBP_PENCE}p, so checkout for this plan will always fail — raise its price in Subscription Plans.` };
  }
  if (plan.price_pence === 0) return { ok: false, message: `"${plan.name}" is free, so there is nothing to check out.` };

  try {
    const provisioned = await ensureStripePrice(stripe, plan);
    if (provisioned.productId !== plan.stripe_product_id || provisioned.priceId !== plan.stripe_price_id) {
      await Plans.setStripeIds(plan.id, provisioned.productId, provisioned.priceId);
    }
    const origin = await currentOrigin();
    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: session.email,
      line_items: [{ price: provisioned.priceId, quantity: 1 }],
      success_url: `${origin}/super-admin/health?checkout=ok`,
      cancel_url: `${origin}/super-admin/health?checkout=canceled`,
    });
    await logIntegrationEvent({ kind: "stripe", level: "info", message: `Test checkout for plan "${plan.name}" was accepted by Stripe.` });
    return { ok: true, message: `Stripe accepted "${plan.name}" for checkout. Opening the link is a real Stripe payment page — close it without paying, or pay to test end to end.`, url: checkout.url ?? undefined };
  } catch (err) {
    await logIntegrationEvent({ kind: "stripe", level: "error", message: `Test checkout for plan "${plan.name}" was refused by Stripe.`, detail: stripeErrorLine(err) });
    return { ok: false, message: `Stripe refused: ${stripeErrorLine(err)}` };
  }
}
