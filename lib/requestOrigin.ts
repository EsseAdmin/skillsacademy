import { headers } from "next/headers";
import { isPlatformHost } from "@/lib/platformDomains";
import { Academies } from "@/lib/queries";

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
  let host = (hdrs.get("host") || "").toLowerCase();
  // The Host header is chosen by whoever sends the request, and this address ends up in password-reset and
  // verification emails. Trust it only if it is the platform itself or a verified academy domain.
  if (!host || (!isPlatformHost(host) && !(await Academies.byCustomDomain(host.split(":")[0]).catch(() => undefined)))) {
    host = "skillacademies.ai";
  }
  const forwarded = hdrs.get("x-forwarded-proto");
  const proto = forwarded === "http" || forwarded === "https" ? forwarded : host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}
