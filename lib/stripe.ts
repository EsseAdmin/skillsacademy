// Thin wrapper around the Stripe SDK, following the same graceful-
// degradation pattern as lib/email.ts: this app is expected to run for a
// while (local dev, or production before the platform owner has finished
// setting up Stripe) without a real STRIPE_SECRET_KEY configured. Every
// caller must go through getStripeClient() and handle a null return
// rather than assuming Stripe is always available.
//
// Deliberately does NOT use Stripe Connect / Express accounts — this
// platform isn't a marketplace paying out to many third parties, it's a
// single business (the platform owner) collecting subscription payments
// from academies into its own Stripe balance. Getting that balance paid
// out to a real bank account on a schedule (e.g. monthly) is configured
// directly in the Stripe Dashboard under Settings → Payouts once the
// account exists and its business/bank details are verified — that whole
// step happens outside this app and outside this session; nothing here
// ever collects or stores raw bank account details.
import Stripe from "stripe";

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

// Deliberately not cached across calls — constructing a Stripe client is
// cheap (no network call happens until a method is actually invoked), and
// not caching means adding the key never requires remembering to also
// clear some in-memory cache.
export function getStripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

// Shared by both the customer-facing checkout flow (lazy: provision on
// first subscribe) and the explicit super-admin "Sync to Stripe" action
// (eager: provision every active plan up front). Stripe Prices are
// immutable once created, so if the plan's price_pence no longer matches
// what's stored, this creates a fresh Price under the same Product rather
// than trying to mutate the old one — existing subscribers keep billing
// at whatever price they originally agreed to until they resubscribe or
// change plans, which mirrors how real SaaS billing changes are usually
// handled.
export async function ensureStripePrice(
  stripe: Stripe,
  plan: { id: string; name: string; price_pence: number; stripe_product_id: string | null; stripe_price_id: string | null }
): Promise<{ productId: string; priceId: string }> {
  let productId = plan.stripe_product_id;
  if (!productId) {
    const product = await stripe.products.create({
      name: plan.name,
      metadata: { skillsacademy_plan_id: plan.id },
    });
    productId = product.id;
  }

  if (plan.stripe_price_id) {
    const existing = await stripe.prices.retrieve(plan.stripe_price_id);
    if (existing.active && existing.unit_amount === plan.price_pence && existing.recurring?.interval === "month") {
      return { productId, priceId: existing.id };
    }
    // Price drifted (or was archived) — archive it and mint a new one below
    // rather than trying to mutate an immutable Stripe Price object.
    await stripe.prices.update(plan.stripe_price_id, { active: false }).catch(() => {});
  }

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: plan.price_pence,
    currency: "gbp",
    recurring: { interval: "month" },
    metadata: { skillsacademy_plan_id: plan.id },
  });

  return { productId, priceId: price.id };
}
