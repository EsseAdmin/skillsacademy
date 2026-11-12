// Shared secret for the scheduled archive job. The Netlify scheduled function
// and the Next.js route are deployed together and see the same environment, so
// the token is derived from AUTH_SECRET: no extra variable has to be set for
// it to work. CRON_SECRET overrides it if you'd rather set your own.
import crypto from "node:crypto";

export function cronToken(): string {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET;
  const secret = process.env.AUTH_SECRET || "skillsacademy-dev-secret-change-me-in-production";
  return crypto.createHmac("sha256", secret).update("archive-cancelled-academies").digest("hex");
}

export function tokenMatches(given: string | null | undefined): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(cronToken());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
