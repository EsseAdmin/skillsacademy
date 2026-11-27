// Netlify scheduled function: every 4 minutes, if KEEP_WARM=on, visit /api/warm so the site (and the database behind it) stays awake
// and the next real visitor does not wait for a cold start (which can take 5+ seconds). Off by default because it keeps the
// database running around the clock, which can use more of a metered database plan. Switch on with KEEP_WARM=on in Netlify.
export default async function handler() {
  if (String(process.env.KEEP_WARM || "").toLowerCase() !== "on") return;
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (!base) return;
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/api/warm`, { headers: { "user-agent": "skillsacademy-keep-warm" } });
    console.log(`[keep-warm] ${res.status}`);
  } catch (err) {
    console.error("[keep-warm] failed:", err instanceof Error ? err.message : err);
  }
}

export const config = { schedule: "*/4 * * * *" };
