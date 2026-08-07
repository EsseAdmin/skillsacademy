import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe";
import { Academies, SubscriptionInvoices, StripeWebhookEvents } from "@/lib/queries";

// Real subscription billing events land here. Explicitly Node runtime (not
// Edge) for the same reason as app/api/resolve-domain/route.ts — keeps this
// route on a predictable runtime regardless of deployment target.
export const runtime = "nodejs";

// Maps a Stripe Subscription's own status onto this app's simpler
// subscription_status vocabulary (trialing | active | past_due | canceled)
// used throughout the billing UI. Stripe's 'incomplete'/'incomplete_expired'/
// 'unpaid'/'paused' states all collapse to 'past_due' here — the important
// distinction the UI needs is "is access currently paid for", not every
// nuance of why it currently isn't.
function mapSubscriptionStatus(stripeStatus: Stripe.Subscription.Status): string {
  switch (stripeStatus) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "canceled":
      return "canceled";
    default:
      return "past_due";
  }
}

async function findAcademyForCustomer(customerId: string | Stripe.Customer | Stripe.DeletedCustomer | null) {
  if (!customerId) return undefined;
  const id = typeof customerId === "string" ? customerId : customerId.id;
  return Academies.byStripeCustomerId(id);
}

export async function POST(req: NextRequest) {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    // Not configured yet — Stripe isn't sending anything here in that
    // case anyway (there's no webhook endpoint registered until the
    // platform admin does that as part of setup), but respond clearly
    // rather than 500ing if something does hit this route early.
    return NextResponse.json({ error: "Stripe isn't configured on this deployment." }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature." }, { status: 400 });

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  // Idempotency: Stripe retries on anything but a 2xx, and can occasionally
  // deliver the same event more than once anyway. Skip work we've already
  // done rather than e.g. recording the same invoice twice.
  const isNewEvent = await StripeWebhookEvents.markProcessed(event.id, event.type);
  if (!isNewEvent) return NextResponse.json({ received: true, duplicate: true });

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription" && session.subscription) {
        const academyId = session.metadata?.skillsacademy_academy_id;
        const planId = session.metadata?.skillsacademy_plan_id;
        const academy = academyId ? await Academies.byId(academyId) : await findAcademyForCustomer(session.customer);
        if (academy) {
          await Academies.setStripeSubscription(academy.id, {
            stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : session.subscription.id,
            subscriptionStatus: "active",
            planId: planId || undefined,
          });
        }
      }
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const academy = await findAcademyForCustomer(invoice.customer);
      if (academy) {
        const alreadyRecorded = invoice.id ? await SubscriptionInvoices.byStripeInvoiceId(invoice.id) : undefined;
        if (!alreadyRecorded) {
          const periodStart = invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : undefined;
          const periodEnd = invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : undefined;
          await SubscriptionInvoices.create({
            academy_id: academy.id,
            plan_id: academy.plan_id,
            amount_pence: invoice.amount_paid,
            provider: "stripe",
            stripe_invoice_id: invoice.id,
            period_start: periodStart,
            period_end: periodEnd,
          });
        }
        if (academy.subscription_status !== "active") {
          await Academies.update(academy.id, { subscription_status: "active" });
        }
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const academy = await findAcademyForCustomer(invoice.customer);
      if (academy) {
        await Academies.update(academy.id, { subscription_status: "past_due" });
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const academy = await findAcademyForCustomer(subscription.customer);
      if (academy) {
        await Academies.setStripeSubscription(academy.id, {
          stripeSubscriptionId: subscription.id,
          subscriptionStatus: mapSubscriptionStatus(subscription.status),
        });
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const academy = await findAcademyForCustomer(subscription.customer);
      if (academy) {
        await Academies.update(academy.id, { subscription_status: "canceled" });
      }
      break;
    }

    default:
      // Every other event type is either irrelevant to subscription
      // billing or not yet handled — acknowledging with 200 either way
      // stops Stripe retrying a delivery this app was never going to act
      // on, per Stripe's own recommendation to only subscribe a webhook
      // endpoint to the event types it actually needs.
      break;
  }

  return NextResponse.json({ received: true });
}
