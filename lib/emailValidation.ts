import { resolveMx, resolve4, resolve6 } from "node:dns/promises";

// Shared "is this a real, enterable email address" check — used at every
// point a *new* email address is captured (academy signup, admin adding an
// instructor/learner, learner self-registration), so obviously fake or
// mistyped addresses are rejected before an account is created rather than
// silently accepted and only discovered later when an email never arrives.
//
// Deliberately NOT full mailbox verification (e.g. SMTP handshake / a
// paid verification API like ZeroBounce or Kickbox) — that's slow, often
// blocked by mail servers, and out of scope here. This does two cheap,
// reliable checks instead:
//   1. Syntax: a reasonably strict (not just `type="email"`-permissive)
//      structural check.
//   2. Domain reachability: does the domain have any mail exchanger (MX)
//      configured, with a fallback to a plain A/AAAA record (some domains
//      still receive mail via their bare A record per RFC 5321 §5.1 rather
//      than an explicit MX)? A domain with neither can't receive email at
//      all, which catches the overwhelming majority of "fake" domains
//      (typos, made-up domains, non-existent TLDs) without needing any
//      external service or maintained disposable-email blocklist.

const EMAIL_SYNTAX_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function isValidEmailSyntax(email: string): boolean {
  if (!email || email.length > 254) return false;
  if (email.includes("..")) return false;
  const [local] = email.split("@");
  if (!local || local.length > 64) return false;
  return EMAIL_SYNTAX_RE.test(email);
}

async function domainHasMailServer(domain: string): Promise<boolean> {
  try {
    const records = await resolveMx(domain);
    if (records.length > 0) return true;
  } catch {
    // ENOTFOUND / ENODATA here just means "no MX records" — fall through
    // to the A/AAAA fallback below rather than treating it as reachable.
  }
  // No MX records: per RFC 5321 §5.1, mail can still be deliverable to a
  // domain's bare A/AAAA record. Only domains with neither are genuinely
  // unreachable.
  try {
    const a = await resolve4(domain);
    if (a.length > 0) return true;
  } catch {
    // fall through to AAAA
  }
  try {
    const aaaa = await resolve6(domain);
    return aaaa.length > 0;
  } catch {
    return false;
  }
}

export type EmailValidationResult = { valid: boolean; reason?: string };

// Errors that mean "this domain genuinely can't receive email" vs. errors
// that mean "we couldn't check right now" are handled the same way inside
// domainHasMailServer (both fall through to false) *except* for one thing:
// if DNS resolution itself is broken in this environment (no resolver
// reachable at all — a hosting/network problem, not a fact about the
// domain), we don't want to reject every single signup because of it. We
// detect that case separately by checking whether a definitely-real,
// always-resolvable domain also fails, and fail OPEN (skip the domain
// check, syntax check still applies) if so, rather than fail closed and
// block real users because of an infrastructure hiccup on our end.
let dnsResolverHealthy: boolean | null = null;
async function isDnsResolverHealthy(): Promise<boolean> {
  if (dnsResolverHealthy !== null) return dnsResolverHealthy;
  try {
    const records = await resolveMx("gmail.com");
    dnsResolverHealthy = records.length > 0;
  } catch {
    dnsResolverHealthy = false;
  }
  return dnsResolverHealthy;
}

export async function validateEmailIsReal(email: string): Promise<EmailValidationResult> {
  const trimmed = email.trim().toLowerCase();
  if (!isValidEmailSyntax(trimmed)) {
    return { valid: false, reason: "Please enter a valid email address." };
  }

  const domain = trimmed.split("@")[1];

  if (!(await isDnsResolverHealthy())) {
    // Can't reliably check any domain right now — don't block real users
    // over an infrastructure problem on our side. Syntax check above still
    // applies.
    return { valid: true };
  }

  const reachable = await domainHasMailServer(domain);
  if (!reachable) {
    return { valid: false, reason: "We couldn't find a mail server for that email's domain — check it for typos." };
  }

  return { valid: true };
}
