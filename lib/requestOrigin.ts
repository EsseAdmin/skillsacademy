import { headers } from "next/headers";

// Shared by anything that needs to build an absolute URL back into the app
// from inside a Server Action or Route Handler — password-reset emails
// (lib/passwordResetEmail.ts) and Stripe Checkout success/cancel URLs
// (lib/actions/billing.ts) both need this. Reads the actual incoming
// request's Host/x-forwarded-proto rather than a hardcoded platform
// domain, so the generated URL is correct whether the visitor is on
// skillsacademy.ai, the Netlify preview domain, or an academy's own
// verified custom domain.
export async function currentOrigin(): Promise<string> {
  const hdrs = await headers();
  const host = hdrs.get("host") || "skillsacademy.ai";
  const proto = hdrs.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
