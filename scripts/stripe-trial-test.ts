// Unit tests for how the remaining free trial is handed to Stripe Checkout (lib/stripeTrial.ts). No database needed.
//   npx tsx scripts/stripe-trial-test.ts
import { checkoutTrialFor, STRIPE_MIN_TRIAL_MS } from "../lib/stripeTrial";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail ? " :: " + detail : ""}`);
}
const now = Date.parse("2026-12-01T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const day = 24 * 60 * 60 * 1000;

const t5 = checkoutTrialFor("trialing", iso(now + 5 * day), now);
check("5 days left: Stripe's trial ends exactly when the academy's trial does", t5.trialEnd === Math.floor((now + 5 * day) / 1000) && !t5.extended);

const t1 = checkoutTrialFor("trialing", iso(now + 6 * 60 * 60 * 1000), now);
check("6 hours left: stretched to Stripe's 48-hour minimum, never charged early", t1.extended && t1.trialEnd !== null && t1.trialEnd * 1000 >= now + STRIPE_MIN_TRIAL_MS);

check("trial already over: first payment is taken now", checkoutTrialFor("trialing", iso(now - day), now).trialEnd === null);
check("an academy that is not trialing gets no trial", checkoutTrialFor("past_due", iso(now + 5 * day), now).trialEnd === null && checkoutTrialFor("canceled", iso(now + 5 * day), now).trialEnd === null && checkoutTrialFor("active", iso(now + 5 * day), now).trialEnd === null);
check("a bad date gives no trial rather than an error", checkoutTrialFor("trialing", "not a date", now).trialEnd === null);
const exact = checkoutTrialFor("trialing", iso(now + STRIPE_MIN_TRIAL_MS + 20 * 60 * 1000), now);
check("just over the minimum keeps the academy's own end date", !exact.extended);

if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log("\nAll passed");
