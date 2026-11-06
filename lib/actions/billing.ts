"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Academies, Plans, Users, Courses } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { getStripeClient, ensureStripePrice, priceBelowStripeMinimum, stripeErrorLine, describeStripeError, STRIPE_MIN_GBP_PENCE } from "@/lib/stripe";
import { logIntegrationEvent } from "@/lib/integrationLog";
import { currentOrigin } from "@/lib/requestOrigin";
import { stopStripeBilling, resumeStripeBilling } from "@/lib/billingCancel";
import { archiveTimeFor, archiveDueAcademies } from "@/lib/archiveCancelled";
import { notifyPlatformOfCancellation, notifyPlatformOfWithdrawal, sendRequesterReceipt } from "@/lib/cancellationEmail";

export type BillingState = { error?: string } | undefined;

// Real Stripe Checkout for an academy's subscription — replaces the old
// simulated flow that just regex-validated a typed-in card number and
// never actually charged anyone. This is deliberately NOT a Stripe
// Connect / Express setup: academies pay the platform directly into the
// platform's own Stripe balance, same as any normal SaaS subscription.
// Getting that balance paid out to the platform owner's real bank account
// on a schedule (e.g. monthly) is a Stripe Dashboard account setting
// (Settings → Payouts) completed outside this app — see the super-admin
// Payouts page for status/instructions once Stripe is configured.
export async function subscribeAcademy(slug: string, _prevState: BillingState, formData: FormData): Promise<BillingState> {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const planKey = String(formData.get("plan") || "");
  const plans = await Plans.all(true);
  const plan = plans.find((p) => p.key === planKey);
  if (!plan) return { error: "Please choose a valid plan." };

  const stripe = getStripeClient();
  if (!stripe) {
    return { error: "Payments aren't set up yet on this platform — the platform administrator needs to add a Stripe API key first." };
  }

  // Stripe can't charge under 30p. Say so plainly (and tell the platform
  // admin on the System check page) instead of failing inside Checkout.
  if (priceBelowStripeMinimum(plan.price_pence)) {
    await logIntegrationEvent({
      kind: "stripe",
      level: "error",
      message: `Checkout blocked: plan "${plan.name}" is priced at ${plan.price_pence}p, below Stripe's ${STRIPE_MIN_GBP_PENCE}p minimum.`,
      detail: `Academy: ${slug}. Raise the plan price to at least £0.30 in Super Admin → Subscription Plans.`,
    });
    return { error: "This plan's price is set below the minimum card payment (30p), so it can't be charged yet. Please contact the platform administrator." };
  }

  const academy = await Academies.byId(session.academyId!);
  if (!academy) return { error: "Academy not found." };
  if (academy.cancellation_requested_at) {
    return { error: "You've asked to cancel this academy, so no payment can be started. Withdraw the cancellation request first if you want to keep it." };
  }

  let priceId: string;
  try {
    const provisioned = await ensureStripePrice(stripe, plan);
    priceId = provisioned.priceId;
    if (provisioned.productId !== plan.stripe_product_id || provisioned.priceId !== plan.stripe_price_id) {
      await Plans.setStripeIds(plan.id, provisioned.productId, provisioned.priceId);
    }
  } catch (err) {
    // Logged (not just swallowed) so the real Stripe error is visible in
    // Netlify's function logs — the message shown to the admin is
    // deliberately generic (never surface raw Stripe/API errors to a
    // tenant user), but without this, diagnosing a failed checkout meant
    // guessing blind. Common cause here: the plan's price drifted from an
    // existing Stripe Price that's no longer valid in this account/mode.
    console.error(`[billing] ensureStripePrice failed for plan ${plan.id} (${plan.key}):`, err);
    await logIntegrationEvent({ kind: "stripe", level: "error", message: `Couldn't set up the Stripe price for plan "${plan.name}".`, detail: stripeErrorLine(err) });
    return { error: "This plan couldn't be set up for payment right now. Please try again shortly, or contact support." };
  }

  let customerId = academy.stripe_customer_id;
  if (!customerId) {
    try {
      const customer = await stripe.customers.create({
        name: academy.name,
        email: academy.contact_email,
        metadata: { skillsacademy_academy_id: academy.id, skillsacademy_slug: academy.slug },
      });
      customerId = customer.id;
      await Academies.setStripeCustomer(academy.id, customerId);
    } catch (err) {
      console.error(`[billing] stripe.customers.create failed for academy ${academy.id} (${academy.slug}):`, err);
      await logIntegrationEvent({ kind: "stripe", level: "error", message: `Couldn't create a Stripe customer for academy ${academy.slug}.`, detail: stripeErrorLine(err) });
      return { error: "Couldn't reach the payment provider right now. Please try again shortly." };
    }
  }

  const origin = await currentOrigin();
  let checkoutUrl: string | null;
  try {
    const createCheckout = (customer: string) =>
      stripe.checkout.sessions.create({
        mode: "subscription",
        customer,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}/a/${slug}/admin/billing?updated=1`,
        cancel_url: `${origin}/a/${slug}/admin/billing?canceled=1`,
        metadata: { skillsacademy_academy_id: academy.id, skillsacademy_plan_id: plan.id, skillsacademy_slug: slug },
        subscription_data: {
          metadata: { skillsacademy_academy_id: academy.id, skillsacademy_plan_id: plan.id, skillsacademy_slug: slug },
        },
      });
    let checkoutSession;
    try {
      checkoutSession = await createCheckout(customerId);
    } catch (err) {
      // A stored customer id from another Stripe mode/account (e.g. created
      // with a test key) is "No such customer": make a fresh one and retry once.
      if (!/no such customer/i.test(describeStripeError(err).message)) throw err;
      const fresh = await stripe.customers.create({
        name: academy.name,
        email: academy.contact_email,
        metadata: { skillsacademy_academy_id: academy.id, skillsacademy_slug: academy.slug },
      });
      customerId = fresh.id;
      await Academies.setStripeCustomer(academy.id, customerId);
      checkoutSession = await createCheckout(customerId);
    }
    checkoutUrl = checkoutSession.url;
  } catch (err) {
    // This is the catch most likely to fire for a live-mode account whose
    // Stripe business/identity verification isn't fully complete yet —
    // Stripe lets you create Products/Prices/Customers in live mode
    // before that's done, but blocks creating a live Checkout Session
    // with an error naming the specific missing requirement. Check
    // Netlify's function logs for this academy's attempt (search
    // "[billing] stripe.checkout.sessions.create failed") for the exact
    // Stripe error/code, and/or the Stripe Dashboard's account status
    // banner and the super-admin Payouts page's verification checklist.
    console.error(`[billing] stripe.checkout.sessions.create failed for academy ${academy.id} (${academy.slug}), plan ${plan.id}:`, err);
    await logIntegrationEvent({
      kind: "stripe",
      level: "error",
      message: `Stripe refused to start checkout for plan "${plan.name}" (academy ${academy.slug}).`,
      detail: stripeErrorLine(err),
    });
    // Amount below the card minimum is the one failure an admin can't fix
    // themselves but should be told is a pricing problem, not "try again".
    const d = describeStripeError(err);
    if (d.code === "amount_too_small" || /at least/i.test(d.message)) {
      return { error: "This plan's price is below the minimum card payment, so checkout can't start. Please contact the platform administrator." };
    }
    return { error: "Couldn't start checkout right now. Please try again shortly." };
  }

  if (!checkoutUrl) {
    console.error(`[billing] stripe.checkout.sessions.create returned no url for academy ${academy.id} (${academy.slug}), plan ${plan.id}`);
    await logIntegrationEvent({ kind: "stripe", level: "error", message: `Stripe returned no checkout URL for plan "${plan.name}".` });
    return { error: "Couldn't start checkout right now. Please try again shortly." };
  }
  redirect(checkoutUrl);
}

export async function changePlanTrial(slug: string, formData: FormData) {
  // Allows switching plan while still on trial, without payment — real
  // billing only starts once the academy actually goes through Stripe
  // Checkout via subscribeAcademy above.
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const planKey = String(formData.get("plan") || "");
  const plans = await Plans.all(true);
  const plan = plans.find((p) => p.key === planKey);
  if (!plan) return;
  await Academies.update(session.academyId!, { plan_id: plan.id });
  revalidatePath(`/a/${slug}/admin/billing`);
}

// Lets an already-subscribed academy admin update their card, view
// invoices, or cancel — via Stripe's own hosted Customer Portal rather
// than building custom UI for any of that (and rather than this app ever
// touching real card data itself).
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState always calls with (prevState, formData); this action needs neither.
export async function manageBilling(slug: string, _prevState: BillingState, _formData: FormData): Promise<BillingState> {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const stripe = getStripeClient();
  if (!stripe) return { error: "Payments aren't set up yet on this platform." };

  const academy = await Academies.byId(session.academyId!);
  if (!academy?.stripe_customer_id) return { error: "No billing account found yet — subscribe to a plan first." };
  if (academy.cancellation_requested_at) {
    return { error: "You've asked to cancel this academy. Withdraw the cancellation request first if you want to change your billing." };
  }

  const origin = await currentOrigin();
  let portalUrl: string;
  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: academy.stripe_customer_id,
      return_url: `${origin}/a/${slug}/admin/billing`,
    });
    portalUrl = portalSession.url;
  } catch (err) {
    console.error(`[billing] stripe.billingPortal.sessions.create failed for academy ${academy.id} (${academy.slug}):`, err);
    return { error: "Couldn't open the billing portal right now. Please try again shortly." };
  }

  redirect(portalUrl);
}

// The academy admin cancels their subscription and asks for the academy to be
// deleted. In order: (1) stop Stripe taking any further payment — if Stripe
// can't confirm that, nothing is recorded and the admin is told, rather than
// being promised something that didn't happen; (2) record the request;
// (3) email the platform admins and send the requester a receipt. The academy
// itself is archived automatically 24 hours later (hidden but kept, restorable by
// a super admin, who deletes it for good), and the request can be withdrawn until then.
export async function requestCancellation(slug: string, _prevState: BillingState, formData: FormData): Promise<BillingState> {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const academy = await Academies.byId(session.academyId!);
  if (!academy) return { error: "Academy not found." };
  if (academy.cancellation_requested_at) return { error: "A cancellation request has already been sent for this academy." };
  if (formData.get("confirm") !== "on") {
    return { error: "Please tick the box to confirm you want to cancel and delete your academy." };
  }
  const reason = String(formData.get("reason") || "").trim().slice(0, 1000);

  const stopped = await stopStripeBilling(academy, "period_end");
  if (!stopped.ok) {
    await logIntegrationEvent({
      kind: "stripe",
      level: "error",
      message: `Cancellation request for academy "${academy.slug}" not recorded: Stripe wouldn't confirm the subscription was stopped.`,
      detail: stopped.error,
    });
    return { error: "We couldn't stop your billing just now, so nothing has been cancelled and no request was sent. Please try again in a few minutes." };
  }
  const billing = stopped.hadSubscription ? "stopped" : "none";

  await Academies.setCancellationRequest(academy.id, { reason, accessUntil: stopped.accessUntil, billing, archiveAt: archiveTimeFor() });

  const plan = await Plans.byId(academy.plan_id);
  const details = {
    academy: (await Academies.byId(academy.id))!,
    requesterName: session.name,
    requesterEmail: session.email,
    planName: plan?.name ?? "—",
    learners: (await Users.listByAcademy(academy.id, "LEARNER")).length,
    courses: (await Courses.listByAcademy(academy.id)).length,
    reason,
    billing,
    accessUntil: stopped.accessUntil,
    origin: await currentOrigin(),
  } as const;
  try {
    const sent = await notifyPlatformOfCancellation(details);
    if (sent.delivered > 0) await Academies.markCancellationNotified(academy.id);
    else {
      await logIntegrationEvent({
        kind: "email",
        level: "error",
        message: `Cancellation email for academy "${academy.slug}" wasn't delivered to the platform admins.`,
        detail: sent.recipients === 0 ? "No super admin email addresses found." : "The mail provider rejected every message — see the System check page.",
      });
    }
    await sendRequesterReceipt(details);
  } catch (err) {
    console.error(`[billing] cancellation emails failed for academy ${academy.slug}:`, err);
  }

  // Also archive anything else that's already past its 24 hours, in case the scheduled job is late.
  await archiveDueAcademies().catch(() => undefined);

  revalidatePath(`/a/${slug}/admin/billing`);
  revalidatePath(`/a/${slug}/admin`);
  revalidatePath("/super-admin");
  revalidatePath("/super-admin/academies");
  redirect(`/a/${slug}/admin/billing?cancellation=requested`);
}

export async function withdrawCancellation(slug: string, _prevState: BillingState, _formData: FormData): Promise<BillingState> { // eslint-disable-line @typescript-eslint/no-unused-vars
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const academy = await Academies.byId(session.academyId!);
  if (!academy?.cancellation_requested_at) return { error: "There's no cancellation request to withdraw." };

  const resumed = await resumeStripeBilling(academy);
  if (!resumed.ok) {
    return { error: "We couldn't switch your billing back on just now, so the request is still in place. Please try again in a few minutes." };
  }
  await Academies.clearCancellationRequest(academy.id);
  try {
    await notifyPlatformOfWithdrawal({ academy, requesterName: session.name, requesterEmail: session.email, origin: await currentOrigin() });
  } catch (err) {
    console.error(`[billing] withdrawal email failed for academy ${academy.slug}:`, err);
  }
  revalidatePath(`/a/${slug}/admin/billing`);
  revalidatePath(`/a/${slug}/admin`);
  revalidatePath("/super-admin");
  revalidatePath("/super-admin/academies");
  redirect(`/a/${slug}/admin/billing?cancellation=withdrawn`);
}
