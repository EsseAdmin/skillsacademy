// Netlify scheduled function: every Monday at 08:00 UTC, ask the site to email each academy's admins
// their weekly engagement summary. It only makes an authenticated request; the work happens in
// app/api/cron/weekly-digest. Each academy is emailed at most once every 6 days.
import { createHmac } from "node:crypto";

function token() {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET;
  const secret = process.env.AUTH_SECRET || "skillsacademy-dev-secret-change-me-in-production";
  return createHmac("sha256", secret).update("archive-cancelled-academies").digest("hex");
}

export default async function handler() {
  const base = process.env.ARCHIVE_CRON_BASE_URL || process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (!base) {
    console.error("[weekly-digest] no site URL available (URL / DEPLOY_PRIME_URL).");
    return;
  }
  const res = await fetch(`${base.replace(/\/$/, "")}/api/cron/weekly-digest`, {
    method: "POST",
    headers: { authorization: `Bearer ${token()}` },
  });
  console.log(`[weekly-digest] ${res.status} ${await res.text()}`);
}

export const config = { schedule: "0 8 * * 1" };
