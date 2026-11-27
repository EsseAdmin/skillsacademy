// End-to-end test: subscribing during the free trial saves the card but charges nothing until the trial ends.
// Runs its own fake Stripe. Start the app with:
//   STRIPE_SECRET_KEY=sk_test_fake STRIPE_API_BASE_URL=http://localhost:4020 STRIPE_WEBHOOK_SECRET=whsec_fake
// Run: TRIALCO_BASE_URL=http://localhost:3151 DATABASE_URL=postgres://… node scripts/trial-checkout-e2e.mjs
import http from "node:http";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const pg = require("pg");
const Stripe = require("stripe");

const BASE = process.env.TRIALCO_BASE_URL || "http://localhost:3151";
const PORT = 4020;
let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail ? " :: " + detail : ""}`);
}

const sessions = [];
let n = 0;
const fake = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const url = new URL(req.url, "http://x");
    const p = new URLSearchParams(req.method === "GET" ? url.search : body);
    const send = (o) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (url.pathname === "/pay") { res.writeHead(200, { "content-type": "text/html" }); return res.end("<html><body>fake checkout</body></html>"); }
    n++;
    if (url.pathname === "/v1/products") return send({ id: "prod_" + n, object: "product", active: true });
    if (url.pathname === "/v1/prices") return send({ id: "price_" + n, object: "price", active: true, product: p.get("product"), unit_amount: Number(p.get("unit_amount")), currency: "gbp", recurring: { interval: "month" } });
    if (url.pathname === "/v1/customers") return send({ id: "cus_" + n, object: "customer" });
    if (url.pathname === "/v1/checkout/sessions") {
      sessions.push(Object.fromEntries(p));
      return send({ id: "cs_" + n, object: "checkout.session", url: `http://localhost:${PORT}/pay` });
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { type: "invalid_request_error", message: "unknown " + url.pathname, code: "resource_missing" } }));
  });
});

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const stripe = new Stripe("sk_test_fake");
async function webhook(event) {
  const payload = JSON.stringify(event);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_fake" });
  const r = await fetch(BASE + "/api/webhooks/stripe", { method: "POST", headers: { "stripe-signature": header, "content-type": "application/json" }, body: payload });
  return r.status;
}
let evt = 0;
const ev = (type, object) => ({ id: "evt_" + ++evt + "_" + Date.now(), object: "event", type, api_version: "2020-08-27", created: Math.floor(Date.now() / 1000), data: { object } });

async function main() {
  await new Promise((r) => fake.listen(PORT, r));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const page = await (await browser.newContext()).newPage();
  page.setDefaultTimeout(20000);
  await page.goto(BASE + "/a/brightwave/login");
  await page.fill('input[name="email"]', "admin@brightwave.example");
  await page.fill('input[name="password"]', "Password123!");
  await page.click("form button[type=submit]");
  await page.waitForURL((u) => !u.pathname.endsWith("/login"));

  // Put the academy in a trial with 9 days left, no subscription.
  const trialEnd = new Date(Date.now() + 9 * 86400000);
  await db.query("UPDATE academies SET subscription_status='trialing', trial_ends_at=$1, stripe_customer_id=NULL, stripe_subscription_id=NULL, cancellation_requested_at=NULL, is_complimentary=0 WHERE slug='brightwave'", [trialEnd.toISOString()]);

  await page.goto(BASE + "/a/brightwave/admin/billing");
  check("billing page says the trial is kept", /nothing is charged until it ends/i.test(await page.locator("body").innerText()));
  await page.click('button:has-text("Continue to secure checkout")');
  await page.waitForURL(/localhost:4020\/pay/);
  check("Checkout was started once", sessions.length === 1);
  const s = sessions[0] || {};
  const sent = Number(s["subscription_data[trial_end]"]);
  check("Stripe is told the trial end date", Math.abs(sent - Math.floor(trialEnd.getTime() / 1000)) <= 1, String(sent));
  check("the card is always collected", s["payment_method_collection"] === "always");

  // Stripe confirms: nothing was paid yet.
  const acad = (await q("SELECT id FROM academies WHERE slug='brightwave'"))[0];
  const cust = (await q("SELECT stripe_customer_id FROM academies WHERE slug='brightwave'"))[0].stripe_customer_id;
  check("a customer was created", !!cust);
  const plan = (await q("SELECT plan_id FROM academies WHERE slug='brightwave'"))[0].plan_id;
  check("checkout.session.completed accepted", (await webhook(ev("checkout.session.completed", { object: "checkout.session", mode: "subscription", subscription: "sub_t1", customer: cust, payment_status: "no_payment_required", metadata: { skillsacademy_academy_id: acad.id, skillsacademy_plan_id: plan } }))) === 200);
  let row = (await q("SELECT subscription_status, stripe_subscription_id FROM academies WHERE slug='brightwave'"))[0];
  check("the academy stays on trial, with the subscription recorded", row.subscription_status === "trialing" && row.stripe_subscription_id === "sub_t1", JSON.stringify(row));

  // The GBP 0 trial invoice is not a payment.
  const before = (await q("SELECT count(*)::int AS n FROM subscription_invoices WHERE academy_id=$1", [acad.id]))[0].n;
  await webhook(ev("invoice.paid", { object: "invoice", id: "in_zero", customer: cust, amount_paid: 0, period_start: 1, period_end: 2 }));
  row = (await q("SELECT subscription_status FROM academies WHERE slug='brightwave'"))[0];
  const after0 = (await q("SELECT count(*)::int AS n FROM subscription_invoices WHERE academy_id=$1", [acad.id]))[0].n;
  check("a 0 invoice is not recorded and does not turn the academy active", row.subscription_status === "trialing" && after0 === before);

  // Billing page: manage, not a second checkout.
  await page.goto(BASE + "/a/brightwave/admin/billing");
  const body = await page.locator("body").innerText();
  check("billing page shows 'card saved' message", (await page.locator('[data-testid="subscribed-in-trial"]').count()) === 1);
  check("billing page no longer offers a second checkout or plan switch", !/Continue to secure checkout/.test(body) && !/Switch Plan/.test(body));

  // Trial ends: Stripe moves it to active and takes the first payment.
  check("subscription.updated (active) accepted", (await webhook(ev("customer.subscription.updated", { object: "subscription", id: "sub_t1", customer: cust, status: "active" }))) === 200);
  await webhook(ev("invoice.paid", { object: "invoice", id: "in_first", customer: cust, amount_paid: 2900, period_start: 1, period_end: 2 }));
  row = (await q("SELECT subscription_status FROM academies WHERE slug='brightwave'"))[0];
  const after = (await q("SELECT count(*)::int AS n FROM subscription_invoices WHERE academy_id=$1", [acad.id]))[0].n;
  check("after the trial the academy is active and the real payment is recorded", row.subscription_status === "active" && after === before + 1, JSON.stringify(row));

  // An academy whose trial has already ended is charged straight away (no trial passed to Stripe).
  await db.query("UPDATE academies SET subscription_status='trialing', trial_ends_at=$1, stripe_subscription_id=NULL WHERE slug='brightwave'", [new Date(Date.now() - 86400000).toISOString()]);
  sessions.length = 0;
  await page.goto(BASE + "/a/brightwave/admin/billing");
  await page.click('button:has-text("Continue to secure checkout")');
  await page.waitForURL(/localhost:4020\/pay/);
  check("an ended trial passes no trial to Stripe", sessions.length === 1 && !("subscription_data[trial_end]" in sessions[0]));

  await browser.close();
  fake.close();
  await db.end();
  console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
