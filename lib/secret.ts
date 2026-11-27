// The key that signs session cookies (and derives the cron token). It MUST be set in production: the built-in
// fallback below is public (it is in the source code), so anyone could forge a login if it were ever used live.
const DEV_FALLBACK = "skillsacademy-dev-secret-change-me-in-production";

export function authSecret(): string {
  return process.env.AUTH_SECRET || DEV_FALLBACK;
}

/** True when the public fallback key is in use. The Super Admin System check page shows a red warning for it. */
export function usingFallbackSecret(): boolean {
  return !process.env.AUTH_SECRET;
}

/** True when running as a real deployment (not `next dev`, not a test run, not the build step). */
export function isLiveDeployment(): boolean {
  return process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build";
}
