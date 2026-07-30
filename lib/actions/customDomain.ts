"use server";

import { revalidatePath } from "next/cache";
import { resolveTxt } from "node:dns/promises";
import { Academies } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { isPlatformHost } from "@/lib/platformDomains";

// A conservative hostname check: lowercase letters/digits/hyphens, no
// leading/trailing hyphen per label, at least one dot (so a bare "academy"
// with no TLD is rejected) — good enough to catch pasted URLs, typos, and
// obviously-invalid input before it ever reaches DNS.
const HOSTNAME_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

function normalizeDomain(raw: string): string {
  let domain = raw.trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return domain;
}

// These actions return { error } rather than throwing. Next.js redacts a
// thrown Error's message in production builds (it only exposes a `digest`,
// to avoid ever leaking something sensitive from a server-side exception) —
// fine for genuinely unexpected failures, but it means real user-facing
// validation messages ("that domain's already taken", "DNS record not
// found yet") would never reach the admin trying to connect their domain.
// Returning the message as action state instead (consumed via
// useActionState in CustomDomainSettings.tsx) sidesteps that redaction.
export type DomainActionState = { error: string } | null;

export async function setCustomDomain(
  slug: string,
  _prevState: DomainActionState,
  formData: FormData
): Promise<DomainActionState> {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const domain = normalizeDomain(String(formData.get("custom_domain") || ""));

  if (!domain) return { error: "Enter the domain you want to use." };
  if (!HOSTNAME_RE.test(domain)) {
    return { error: "That doesn't look like a valid domain (e.g. academy.yourcompany.com)." };
  }
  if (isPlatformHost(domain)) {
    return { error: "That domain is already used by the SkillsAcademy.ai platform — pick your own domain." };
  }
  const existing = await Academies.byCustomDomain(domain);
  if (existing && existing.id !== session.academyId) {
    return { error: "That domain is already connected to another academy." };
  }

  const token = crypto.randomUUID();
  await Academies.setCustomDomain(session.academyId!, domain, token);
  revalidatePath(`/a/${slug}/admin/settings`);
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept so the signature matches useActionState's (state, payload) shape
export async function verifyCustomDomain(slug: string, _prevState: DomainActionState): Promise<DomainActionState> {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const academy = await Academies.byId(session.academyId!);
  if (!academy || !academy.custom_domain || !academy.custom_domain_verification_token) {
    return { error: "Set a domain first." };
  }

  const recordName = `_skillsacademy-verify.${academy.custom_domain}`;
  let records: string[][];
  try {
    records = await resolveTxt(recordName);
  } catch {
    return {
      error: `Couldn't find a TXT record at ${recordName} yet — DNS changes can take a while to spread. Double-check the record and try again shortly.`,
    };
  }

  const found = records.some((parts) => parts.join("") === academy.custom_domain_verification_token);
  if (!found) {
    return {
      error: `Found a TXT record at ${recordName}, but its value doesn't match — check you copied the verification value exactly.`,
    };
  }

  await Academies.markCustomDomainVerified(session.academyId!);
  revalidatePath(`/a/${slug}/admin/settings`);
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept so the signature matches useActionState's (state, payload) shape
export async function removeCustomDomain(slug: string, _prevState: DomainActionState): Promise<DomainActionState> {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  await Academies.removeCustomDomain(session.academyId!);
  revalidatePath(`/a/${slug}/admin/settings`);
  return null;
}
