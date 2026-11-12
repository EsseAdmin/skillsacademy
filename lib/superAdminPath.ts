// Where the Super Admin (platform owner) portal lives.
//
// The portal's pages are built under /super-admin, but that address is only an internal one. When the environment
// variable SUPER_ADMIN_PATH is set (for example /owner-7k3m9x2q), proxy.ts serves the portal ONLY at that secret address
// and answers a plain "not found" for /super-admin itself, so the portal can't be found by guessing the obvious URL and
// no public page links to it. Every link, redirect and email that points into the portal is built with saHref().
//
// Unset (local development, tests, or a deployment that hasn't chosen a secret yet) the portal stays at /super-admin; the
// System check page flags that. A value that isn't a single path segment of 8-64 letters, digits, "-" or "_" is ignored
// (and flagged) rather than used, so a typo can never lock the owner out.

/** The route the portal's pages are built under. */
export const INTERNAL_BASE = "/super-admin";

const VALID = /^\/[A-Za-z0-9_-]{8,64}$/;

export function normaliseSecretPath(raw: string | undefined | null): string | null {
  const v = (raw ?? "").trim().replace(/\/+$/, "");
  if (!v) return null;
  const withSlash = v.startsWith("/") ? v : `/${v}`;
  return VALID.test(withSlash) && withSlash.toLowerCase() !== INTERNAL_BASE ? withSlash : null;
}

/** Where the portal is served: the secret path when one is configured, otherwise /super-admin. */
export function superAdminBase(): string {
  return normaliseSecretPath(process.env.SUPER_ADMIN_PATH) ?? INTERNAL_BASE;
}

export type SecretPathState = "secret" | "default" | "invalid";

/** For the System check page. */
export function secretPathState(): SecretPathState {
  const raw = (process.env.SUPER_ADMIN_PATH ?? "").trim();
  if (!raw) return "default";
  return normaliseSecretPath(raw) ? "secret" : "invalid";
}

/** Turns an internal portal path ("/super-admin/plans?x=1") into the address visitors use. Other paths pass through. */
export function saHref(internalPath: string): string {
  if (internalPath === INTERNAL_BASE || internalPath.startsWith(`${INTERNAL_BASE}/`) || internalPath.startsWith(`${INTERNAL_BASE}?`)) {
    return superAdminBase() + internalPath.slice(INTERNAL_BASE.length);
  }
  return internalPath;
}

/** True for any href that points into the portal, under either address (used to keep such links off public pages). */
export function isPortalHref(href: string): boolean {
  const h = href.trim().toLowerCase();
  if (h === INTERNAL_BASE || h.startsWith(`${INTERNAL_BASE}/`)) return true;
  const base = normaliseSecretPath(process.env.SUPER_ADMIN_PATH);
  return !!base && (h === base.toLowerCase() || h.startsWith(`${base.toLowerCase()}/`));
}
