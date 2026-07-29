import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

// Symmetric encryption for at-rest secrets we must store but never display
// back (Zoom/Microsoft OAuth access + refresh tokens). Uses AES-256-GCM with
// a key derived from AUTH_SECRET (the same secret that already signs session
// cookies — see src/lib/auth.ts), so no extra environment variable is
// required. Ciphertext is stored as `${ivHex}:${authTagHex}:${cipherHex}`.
const APP_SECRET = process.env.AUTH_SECRET || "dev-only-insecure-secret-change-me";
const KEY = scryptSync(APP_SECRET, "skillsacademy-integration-tokens", 32);

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(ciphertext: string): string {
  const [ivHex, authTagHex, dataHex] = ciphertext.split(":");
  if (!ivHex || !authTagHex || !dataHex) {
    throw new Error("decryptSecret: malformed ciphertext");
  }
  const decipher = createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return decrypted.toString("utf8");
}

export function generateCertificateNumber(): string {
  // e.g. SA-7F3C9A2B — short, unambiguous (uppercase hex), easy to read aloud
  // for a public verification page.
  return `SA-${randomBytes(4).toString("hex").toUpperCase()}`;
}
