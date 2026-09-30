import { randomBytes } from "node:crypto";

// Note: this file used to also export encryptSecret()/decryptSecret()
// (AES-256-GCM helpers for at-rest encryption of Zoom/Microsoft OAuth
// tokens). That OAuth integration was removed — academy admins and
// instructors now just paste their own meeting link when creating a
// LIVE_SESSION module (see lib/actions/modules.ts) — so there are no
// secrets left to encrypt. generateCertificateNumber() is unrelated to that
// integration and is still used by lib/certificates.ts.

export function generateCertificateNumber(): string {
  // e.g. SA-7F3C9A2B — short, unambiguous (uppercase hex), easy to read aloud
  // for a public verification page.
  return `SA-${randomBytes(4).toString("hex").toUpperCase()}`;
}
