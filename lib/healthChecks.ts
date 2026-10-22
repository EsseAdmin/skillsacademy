// Read-only probes behind the Super Admin "System check" page. Each returns
// plain data (never a secret) and never throws — a failing probe is itself
// the finding being reported.
import { getStripeClient, stripeErrorLine } from "@/lib/stripe";

export interface DomainCheck {
  status: "ok" | "limited" | "error" | "no-key";
  fromDomain: string;
  domains?: { name: string; status: string }[];
  fromDomainStatus?: string;
  note?: string;
}

export function fromDomainOf(from: string): string {
  const m = from.match(/@([^>\s]+)/);
  return (m ? m[1] : "").toLowerCase();
}

export async function checkResendDomains(from: string): Promise<DomainCheck> {
  const fromDomain = fromDomainOf(from);
  const key = process.env.RESEND_API_KEY;
  if (!key) return { status: "no-key", fromDomain, note: "RESEND_API_KEY isn't set on this deployment, so no email can be sent." };
  const base = process.env.RESEND_API_URL ? new URL(process.env.RESEND_API_URL).origin : "https://api.resend.com";
  try {
    const res = await fetch(`${base}/domains`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(6000) });
    const text = await res.text();
    if (res.status === 401 || res.status === 403) {
      if (/restricted/i.test(text)) {
        return { status: "limited", fromDomain, note: "This API key is send-only, so it can't list domains. That's fine for sending, but verify in the Resend dashboard that the sender domain shows Verified." };
      }
      return { status: "error", fromDomain, note: `Resend rejected the API key (HTTP ${res.status}): ${text.slice(0, 200)}. Create a new key in Resend and update RESEND_API_KEY.` };
    }
    if (!res.ok) return { status: "error", fromDomain, note: `Resend answered HTTP ${res.status}: ${text.slice(0, 200)}` };
    const json = JSON.parse(text) as { data?: { name: string; status: string }[] };
    const domains = (json.data ?? []).map((d) => ({ name: d.name, status: d.status }));
    const match = domains.find((d) => d.name.toLowerCase() === fromDomain);
    return { status: "ok", fromDomain, domains, fromDomainStatus: match?.status };
  } catch (err) {
    return { status: "error", fromDomain, note: `Couldn't reach Resend: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export interface StripeCheck {
  configured: boolean;
  mode?: "live" | "test" | "restricted-key" | "unknown";
  webhookSecretSet: boolean;
  account?: {
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    currentlyDue: string[];
    disabledReason?: string | null;
    country?: string;
    defaultCurrency?: string;
  };
  error?: string;
}

export async function checkStripe(): Promise<StripeCheck> {
  const key = process.env.STRIPE_SECRET_KEY;
  const webhookSecretSet = !!process.env.STRIPE_WEBHOOK_SECRET;
  const stripe = getStripeClient();
  if (!key || !stripe) return { configured: false, webhookSecretSet };
  const mode = key.startsWith("sk_live_") ? "live" : key.startsWith("sk_test_") ? "test" : key.startsWith("rk_") ? "restricted-key" : "unknown";
  try {
    const a = await stripe.accounts.retrieve(null);
    return {
      configured: true,
      mode,
      webhookSecretSet,
      account: {
        chargesEnabled: !!a.charges_enabled,
        payoutsEnabled: !!a.payouts_enabled,
        detailsSubmitted: !!a.details_submitted,
        currentlyDue: a.requirements?.currently_due ?? [],
        disabledReason: a.requirements?.disabled_reason ?? null,
        country: a.country,
        defaultCurrency: a.default_currency,
      },
    };
  } catch (err) {
    return { configured: true, mode, webhookSecretSet, error: stripeErrorLine(err) };
  }
}
