// Works out how an academy's remaining free trial is handed to Stripe Checkout, so the card can be saved at sign-up
// while nothing is charged until the trial ends. Kept free of any Stripe or database code so it can be tested on its own.

// Stripe Checkout needs the first charge to be at least 48 hours away. When an academy has less trial left than that,
// the trial is stretched to this minimum (a small free extension) instead of charging them early.
export const STRIPE_MIN_TRIAL_MS = 48 * 60 * 60 * 1000;
const SAFETY_MS = 15 * 60 * 1000;

export interface CheckoutTrial {
  /** Unix seconds for Stripe's `subscription_data.trial_end`; null when the first payment should be taken now. */
  trialEnd: number | null;
  /** True when the trial was stretched to Stripe's 48-hour minimum. */
  extended: boolean;
}

/**
 * @param subscriptionStatus the academy's own status ("trialing", "active", "past_due", "canceled")
 * @param trialEndsAt ISO date the free trial ends
 */
export function checkoutTrialFor(subscriptionStatus: string, trialEndsAt: string, nowMs: number = Date.now()): CheckoutTrial {
  if (subscriptionStatus !== "trialing") return { trialEnd: null, extended: false };
  const endMs = new Date(trialEndsAt).getTime();
  if (!Number.isFinite(endMs) || endMs <= nowMs) return { trialEnd: null, extended: false };
  const minEnd = nowMs + STRIPE_MIN_TRIAL_MS + SAFETY_MS;
  if (endMs < minEnd) return { trialEnd: Math.ceil(minEnd / 1000), extended: true };
  return { trialEnd: Math.floor(endMs / 1000), extended: false };
}
