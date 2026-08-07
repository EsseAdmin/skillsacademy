"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Academies, Plans } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { getStripeClient, ensureStripePrice } from "@/lib/stripe";
import { currentOrigin } from "@/lib/requestOrigin";

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

  const academy = await Academies.byId(session.academyId!);
  if (!academy) return { error: "Academy not found." };

  let priceId: string;
  try {
    const provisioned = await ensureStripePrice(stripe, plan);
    priceId = provisioned.priceId;
    if (provisioned.productId !== plan.stripe_product_id || provisioned.priceId !== plan.stripe_price_id) {
      await Plans.setStripeIds(plan.id, provisioned.productId, provisioned.priceId);
    }
  } catch {
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
    } catch {
      return { error: "Couldn't reach the payment provider right now. Please try again shortly." };
    }
  }

  const origin = await currentOrigin();
  let checkoutUrl: string | null;
  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/a/${slug}/admin/billing?updated=1`,
      cancel_url: `${origin}/a/${slug}/admin/billing?canceled=1`,
      metadata: { skillsacademy_academy_id: academy.id, skillsacademy_plan_id: plan.id, skillsacademy_slug: slug },
      subscription_data: {
        metadata: { skillsacademy_academy_id: academy.id, skillsacademy_plan_id: plan.id, skillsacademy_slug: slug },
      },
    });
    checkoutUrl = checkoutSession.url;
  } catch {
    return { error: "Couldn't start checkout right now. Please try again shortly." };
  }

  if (!checkoutUrl) return { error: "Couldn't start checkout right now. Please try again shortly." };
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

  const origin = await currentOrigin();
  let portalUrl: string;
  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: academy.stripe_customer_id,
      return_url: `${origin}/a/${slug}/admin/billing`,
    });
    portalUrl = portalSession.url;
  } catch {
    return { error: "Couldn't open the billing portal right now. Please try again shortly." };
  }

  redirect(portalUrl);
}
