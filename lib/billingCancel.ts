// Stops an academy's subscription payments in Stripe. Used when an academy
// admin asks to cancel (renewals are switched off; they keep what they've
// already paid for until the period ends) and when the super admin deletes an
// academy (the subscription is ended straight away).
//
// The rule that matters: never report success unless Stripe confirmed it. A
// Stripe failure comes back as { ok: false } so the caller can say so instead
// of telling someone their payments have stopped when they haven't.
import type Stripe from "stripe";
import type { Academy } from "@/lib/queries";
import { getStripeClient, describeStripeError, stripeErrorLine } from "@/lib/stripe";

export type StopMode = "period_end" | "immediately";

export interface StopBillingResult {
  ok: boolean;
  error?: string;
  // True when the academy had a live Stripe subscription that was stopped.
  hadSubscription: boolean;
  // ISO date the paid-for period (or trial) runs to; null if nothing to stop.
  accessUntil: string | null;
}

function periodEndOf(sub: Stripe.Subscription): number | null {
  const itemEnd = sub.items?.data?.[0]?.current_period_end;
  const end = (sub.status === "trialing" && sub.trial_end) || itemEnd || sub.cancel_at || null;
  return end ?? null;
}

const DEAD: Stripe.Subscription.Status[] = ["canceled", "incomplete_expired"];

export async function stopStripeBilling(academy: Academy, mode: StopMode): Promise<StopBillingResult> {
  const none: StopBillingResult = { ok: true, hadSubscription: false, accessUntil: null };
  if (!academy.stripe_customer_id && !academy.stripe_subscription_id) return none;

  const stripe = getStripeClient();
  if (!stripe) {
    // Stripe isn't configured here, so this deployment can't be charging anyone.
    // But if we know of a subscription we can't confirm it stopped.
    return academy.stripe_subscription_id
      ? { ok: false, error: "Stripe isn't configured on this deployment, so the subscription couldn't be stopped.", hadSubscription: true, accessUntil: null }
      : none;
  }

  try {
    const subs: Stripe.Subscription[] = [];
    if (academy.stripe_customer_id) {
      const list = await stripe.subscriptions.list({ customer: academy.stripe_customer_id, status: "all", limit: 100 });
      subs.push(...list.data);
    }
    // Also include the subscription we have on record if the customer listing
    // somehow didn't contain it (e.g. customer id missing).
    if (academy.stripe_subscription_id && !subs.some((s) => s.id === academy.stripe_subscription_id)) {
      try {
        subs.push(await stripe.subscriptions.retrieve(academy.stripe_subscription_id));
      } catch (err) {
        if (describeStripeError(err).code !== "resource_missing") throw err;
      }
    }

    const live = subs.filter((s) => !DEAD.includes(s.status));
    let latestEnd: number | null = null;
    for (const sub of live) {
      const end = periodEndOf(sub);
      if (end && (!latestEnd || end > latestEnd)) latestEnd = end;
      if (mode === "immediately") {
        await stripe.subscriptions.cancel(sub.id);
      } else if (!sub.cancel_at_period_end) {
        await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
      }
    }
    return {
      ok: true,
      hadSubscription: live.length > 0,
      accessUntil: mode === "immediately" ? null : latestEnd ? new Date(latestEnd * 1000).toISOString() : null,
    };
  } catch (err) {
    // A customer/subscription this Stripe account has never heard of (e.g. made
    // with a test key) has nothing to charge, so there's nothing to stop.
    if (describeStripeError(err).code === "resource_missing") return none;
    console.error(`[billing] stopping Stripe billing failed for academy ${academy.id} (${academy.slug}):`, err);
    return { ok: false, error: stripeErrorLine(err), hadSubscription: true, accessUntil: null };
  }
}

/** Turns renewals back on for an academy that changed its mind before the period ended. */
export async function resumeStripeBilling(academy: Academy): Promise<{ ok: boolean; error?: string; nothingToResume?: boolean }> {
  if (!academy.stripe_customer_id) return { ok: true, nothingToResume: true };
  const stripe = getStripeClient();
  if (!stripe) return { ok: true, nothingToResume: true };
  try {
    const list = await stripe.subscriptions.list({ customer: academy.stripe_customer_id, status: "all", limit: 100 });
    let resumed = 0;
    for (const sub of list.data) {
      if (DEAD.includes(sub.status)) continue;
      if (sub.cancel_at_period_end) {
        await stripe.subscriptions.update(sub.id, { cancel_at_period_end: false });
        resumed++;
      }
    }
    return { ok: true, nothingToResume: resumed === 0 };
  } catch (err) {
    if (describeStripeError(err).code === "resource_missing") return { ok: true, nothingToResume: true };
    console.error(`[billing] resuming Stripe billing failed for academy ${academy.id} (${academy.slug}):`, err);
    return { ok: false, error: stripeErrorLine(err) };
  }
}
