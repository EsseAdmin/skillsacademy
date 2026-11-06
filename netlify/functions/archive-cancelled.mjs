// Netlify scheduled function: every 15 minutes, ask the site to archive any
// academy that cancelled more than 24 hours ago. It only makes an authenticated
// request to the site; all the work happens in app/api/cron/archive-cancelled.
import { createHmac } from "node:crypto";

function token() {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET;
  const secret = process.env.AUTH_SECRET || "skillsacademy-dev-secret-change-me-in-production";
  return createHmac("sha256", secret).update("archive-cancelled-academies").digest("hex");
}

export default async function handler() {
  const base = process.env.ARCHIVE_CRON_BASE_URL || process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (!base) {
    console.error("[archive-cancelled] no site URL available (URL / DEPLOY_PRIME_URL).");
    return;
  }
  const res = await fetch(`${base.replace(/\/$/, "")}/api/cron/archive-cancelled`, {
    method: "POST",
    headers: { authorization: `Bearer ${token()}` },
  });
  console.log(`[archive-cancelled] ${res.status} ${await res.text()}`);
}

export const config = { schedule: "*/15 * * * *" };
