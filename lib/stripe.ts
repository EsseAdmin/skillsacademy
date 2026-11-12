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
  // STRIPE_API_BASE_URL exists only so automated tests can point the SDK at a
  // local fake; production leaves it unset and talks to api.stripe.com.
  const base = process.env.STRIPE_API_BASE_URL;
  if (base) {
    const u = new URL(base);
    return new Stripe(key, { host: u.hostname, port: u.port || (u.protocol === "https:" ? "443" : "80"), protocol: u.protocol.replace(":", "") as "http" | "https" });
  }
  return new Stripe(key);
}

// Stripe refuses to charge less than 30p in GBP (zero is fine, e.g. a free
// plan or a trial). A plan priced between 1p and 29p can be created in Stripe
// but its Checkout fails, so we stop those prices at the source and explain.
export const STRIPE_MIN_GBP_PENCE = 30;
export function priceBelowStripeMinimum(pricePence: number): boolean {
  return pricePence > 0 && pricePence < STRIPE_MIN_GBP_PENCE;
}

// Pulls the useful, non-secret parts out of whatever the Stripe SDK threw.
export function describeStripeError(err: unknown): { message: string; code?: string; type?: string; param?: string; requestId?: string } {
  const e = err as { message?: string; code?: string; type?: string; param?: string; requestId?: string } | null;
  return {
    message: e?.message || String(err),
    code: e?.code,
    type: e?.type,
    param: e?.param,
    requestId: e?.requestId,
  };
}

export function stripeErrorLine(err: unknown): string {
  const d = describeStripeError(err);
  return [d.message, d.code && `code: ${d.code}`, d.param && `param: ${d.param}`, d.requestId && `request: ${d.requestId}`].filter(Boolean).join(" · ");
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
function isStripeMissing(err: unknown): boolean {
  const e = err as { code?: string; statusCode?: number; message?: string } | null;
  return e?.code === "resource_missing" || e?.statusCode === 404 || /no such (price|product)/i.test(e?.message ?? "");
}

export async function ensureStripePrice(
  stripe: Stripe,
  plan: { id: string; name: string; price_pence: number; stripe_product_id: string | null; stripe_price_id: string | null }
): Promise<{ productId: string; priceId: string }> {
  // Stored Stripe ids can point at objects that don't exist in the account the
  // current key belongs to — typically ids created with a test key and kept
  // after switching to a live key (or deleted in the dashboard). Stripe then
  // answers "No such price/product". That's recoverable: forget the stale id
  // and create fresh objects under the current key.
  let productId = plan.stripe_product_id;
  if (productId) {
    try {
      const product = await stripe.products.retrieve(productId);
      if ((product as { deleted?: boolean }).deleted || product.active === false) productId = null;
    } catch (err) {
      if (!isStripeMissing(err)) throw err;
      productId = null;
    }
  }
  const productWasReplaced = !!plan.stripe_product_id && productId === null;
  if (!productId) {
    const product = await stripe.products.create({
      name: plan.name,
      metadata: { skillsacademy_plan_id: plan.id },
    });
    productId = product.id;
  }

  // A price under a replaced product is no use — go straight to minting one.
  if (plan.stripe_price_id && !productWasReplaced) {
    let existing: Stripe.Price | null = null;
    try {
      existing = await stripe.prices.retrieve(plan.stripe_price_id);
    } catch (err) {
      if (!isStripeMissing(err)) throw err;
    }
    if (existing) {
      if (existing.active && existing.product === productId && existing.unit_amount === plan.price_pence && existing.currency === "gbp" && existing.recurring?.interval === "month") {
        return { productId, priceId: existing.id };
      }
      // Price drifted (or was archived) — archive it and mint a new one below
      // rather than trying to mutate an immutable Stripe Price object.
      await stripe.prices.update(plan.stripe_price_id, { active: false }).catch(() => {});
    }
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
