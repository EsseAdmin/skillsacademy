// End-to-end test for (1) the free-trial length flowing from Super Admin → Plans
// to the public homepage / sign-up page, and (2) an academy admin cancelling
// their subscription and requesting deletion.
//
// It runs its own fake Stripe and fake Resend servers, so the app under test
// must be started with:
//   STRIPE_SECRET_KEY=sk_test_fake STRIPE_API_BASE_URL=http://localhost:4010
//   STRIPE_WEBHOOK_SECRET=whsec_fake RESEND_API_KEY=re_fake RESEND_API_URL=http://localhost:4011/emails
// Run:  TRIAL_TEST_BASE_URL=http://localhost:3150 DATABASE_URL=postgres://… node scripts/trial-cancel-test.mjs
import http from "node:http";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const pg = require("pg");
const Stripe = require("stripe");

const BASE = process.env.TRIAL_TEST_BASE_URL || "http://localhost:3150";
const STRIPE_PORT = 4010, MAIL_PORT = 4011;
let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail ? " :: " + detail : ""}`);
}

// ---------- fake Stripe ----------
const periodEnd = Math.floor(Date.now() / 1000) + 20 * 86400;
const subs = new Map();
const stripeCalls = [];
let failUpdates = false;
function resetSub(id, customer) {
  subs.set(id, { id, object: "subscription", customer, status: "active", cancel_at_period_end: false, trial_end: null, cancel_at: null, items: { object: "list", data: [{ id: "si_1", object: "subscription_item", current_period_end: periodEnd }] } });
}
const stripeServer = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const url = new URL(req.url, "http://x");
    const params = new URLSearchParams(req.method === "GET" || req.method === "DELETE" ? url.search : body);
    stripeCalls.push({ method: req.method, path: url.pathname, params: Object.fromEntries(params) });
    const send = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
    const m = url.pathname.match(/^\/v1\/subscriptions(?:\/([^/]+))?$/);
    if (!m) return send(404, { error: { type: "invalid_request_error", message: "unknown", code: "resource_missing" } });
    const id = m[1];
    if (!id && req.method === "GET") {
      const cust = params.get("customer");
      return send(200, { object: "list", url: "/v1/subscriptions", has_more: false, data: [...subs.values()].filter((s) => s.customer === cust) });
    }
    const sub = id && subs.get(id);
    if (!sub) return send(404, { error: { type: "invalid_request_error", message: "No such subscription", code: "resource_missing" } });
    if (req.method === "GET") return send(200, sub);
    if (req.method === "POST") {
      if (failUpdates) return send(400, { error: { type: "invalid_request_error", message: "boom", code: "parameter_invalid_empty" } });
      if (params.has("cancel_at_period_end")) sub.cancel_at_period_end = params.get("cancel_at_period_end") === "true";
      return send(200, sub);
    }
    if (req.method === "DELETE") { sub.status = "canceled"; return send(200, sub); }
    send(405, {});
  });
});

// ---------- fake Resend ----------
const mails = [];
const mailServer = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    try { mails.push(JSON.parse(body)); } catch { /* ignore */ }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: "em_" + mails.length }));
  });
});

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (sql, p = []) => (await db.query(sql, p)).rows;

async function login(page, path, email, password, leave) {
  await page.goto(BASE + path);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click("form button[type=submit]");
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 20000 });
}
const html = async (path) => (await fetch(BASE + path, { cache: "no-store" })).text();
const visible = (h) => h.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

async function setAllTrial(page, value) {
  await page.goto(BASE + "/super-admin/plans");
  await page.evaluate(() => { document.querySelectorAll("form").forEach((f) => (f.noValidate = true)); });
  await page.fill('[data-testid="trial-days-all"]', String(value));
  await page.click('button:has-text("Apply to all plans")');
  await page.waitForLoadState("networkidle");
}

async function main() {
  await new Promise((r) => stripeServer.listen(STRIPE_PORT, r));
  await new Promise((r) => mailServer.listen(MAIL_PORT, r));
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  // One browser context per signed-in person: the session is a single cookie.
  const saCtx = await browser.newContext();
  const ctx = await browser.newContext();
  const ctx2 = await browser.newContext();
  const sa = await saCtx.newPage();
  await login(sa, "/super-admin/login", "superadmin@skillsacademy.ai", "SuperAdmin123!");

  // ===== Part 1: trial length reaches the public pages =====
  const before = visible(await html("/"));
  check("Homepage starts at the seeded 14-day trial", /Start Your 14-Day Free Trial/.test(before));

  await setAllTrial(sa, 7);
  check("Plans page confirms the change", (await sa.textContent("body")).includes("Free trial set to 7 days"));
  let home = visible(await html("/"));
  check("Homepage hero button now says 7-Day", /Start Your 7-Day Free Trial/.test(home));
  check("Homepage has no leftover '14' trial wording", !/14[- ]day|14 days/i.test(home), (home.match(/.{30}14[- ]days?.{20}/i) || [""])[0]);
  check("Homepage pricing intro, steps and CTA say 7", /Every plan includes a 7-day free trial/.test(home) && /— 7 days free/.test(home) && /Start your 7-day free trial today/.test(home));
  check("Homepage stat shows 7", /\b7\s+Day Free Trial/.test(home));
  check("Every pricing card shows 7-day free trial", (home.match(/7-day free trial/gi) || []).length >= 4, String((home.match(/7-day free trial/gi) || []).length));
  let signup = visible(await html("/signup"));
  check("Sign-up page says 7-day and plan cards follow", /until your 7-day free trial ends/.test(signup) && !/14-day/.test(signup));

  // single plan different → range wording
  const plans = await q("SELECT id, name FROM subscription_plans WHERE is_active = 1 ORDER BY sort_order");
  await sa.goto(BASE + "/super-admin/plans");
  const firstForm = sa.locator("form").filter({ has: sa.locator('input[name="planId"]') }).first();
  await firstForm.locator('input[name="trial_days"]').fill("10");
  await firstForm.locator('button[type=submit]').click();
  await sa.waitForLoadState("networkidle");
  home = visible(await html("/"));
  check("Different trial per plan shows a range", /Start Your 7–10 Day Free Trial/.test(home) && /(Every plan includes|Plans include) a 7–10 day free trial/.test(home) && /10-day free trial/.test(home), JSON.stringify([/Start Your 7–10 Day Free Trial/.test(home), /(Every plan includes|Plans include) a 7–10 day free trial/.test(home), /10-day free trial/.test(home), (home.match(/pricing.{0,10}Pricing.{0,300}/i) || [""])[0]]));
  check("Per-plan edit saved in the database", (await q("SELECT trial_days FROM subscription_plans WHERE id = $1", [plans[0].id]))[0].trial_days === 10);

  // invalid values are refused
  await setAllTrial(sa, 400);
  check("Out-of-range trial is refused with a message", (await sa.url()).includes("error=trial_days") && (await sa.textContent("body")).includes("whole number of days"));
  check("…and nothing changed", (await q("SELECT count(*)::int AS n FROM subscription_plans WHERE trial_days = 400"))[0].n === 0);

  // zero = no trial
  await setAllTrial(sa, 0);
  home = visible(await html("/"));
  check("Zero days removes trial wording", !/free trial/i.test(home.replace(/No free trial/g, "")) || /Create Your Academy/.test(home), (home.match(/.{20}free trial.{20}/i) || [""])[0]);
  check("Pricing cards say 'No free trial'", /No free trial/.test(home));
  signup = visible(await html("/signup"));
  check("Sign-up page has no trial promise at 0", !/until your .* free trial ends/.test(signup));

  // a new academy picks up the new length
  await setAllTrial(sa, 9);
  const planKey = (await q("SELECT key FROM subscription_plans WHERE is_active = 1 ORDER BY sort_order LIMIT 1"))[0].key;
  check("Homepage shows 9 after another change", /Start Your 9-Day Free Trial/.test(visible(await html("/"))), planKey);

  await setAllTrial(sa, 14);
  check("Restored to 14", /Start Your 14-Day Free Trial/.test(visible(await html("/"))));

  // ===== Part 2: cancellation =====
  await q("UPDATE academies SET stripe_customer_id='cus_bw', stripe_subscription_id='sub_bw', subscription_status='active' WHERE slug='brightwave'");
  resetSub("sub_bw", "cus_bw");

  const admin = await ctx.newPage();
  await login(admin, "/a/brightwave/login", "admin@brightwave.example", "Password123!");
  const stale = await ctx.newPage();
  await stale.goto(BASE + "/a/brightwave/admin/billing");
  check("Billing page shows the cancel section", (await admin.goto(BASE + "/a/brightwave/admin/billing"), await admin.locator('[data-testid="cancel-form"]').count()) === 1);

  // Stripe failure: nothing recorded, no email
  failUpdates = true; mails.length = 0;
  await admin.check('[data-testid="cancel-confirm"]');
  await admin.fill('[data-testid="cancel-reason"]', "Too expensive <b>for us</b>");
  await admin.click('[data-testid="cancel-submit"]');
  await admin.waitForSelector('[data-testid="cancel-error"]');
  check("Stripe failure is reported honestly", (await admin.textContent('[data-testid="cancel-error"]')).includes("couldn't stop your billing"));
  check("…nothing recorded and no email sent", (await q("SELECT cancellation_requested_at AS c FROM academies WHERE slug='brightwave'"))[0].c === null && mails.length === 0);
  check("…the typed reason survives the error", (await admin.inputValue('[data-testid="cancel-reason"]')).includes("Too expensive"));
  failUpdates = false;

  // Box not ticked
  await admin.uncheck('[data-testid="cancel-confirm"]');
  await admin.click('[data-testid="cancel-submit"]');
  await admin.waitForFunction(() => document.querySelector('[data-testid="cancel-error"]')?.textContent.includes("tick the box"), null, { timeout: 15000 }).catch(() => {});
  check("Unticked confirmation is refused", (await admin.textContent('[data-testid="cancel-error"]')).includes("tick the box"));

  // Real request
  stripeCalls.length = 0; mails.length = 0;
  await admin.check('[data-testid="cancel-confirm"]');
  await admin.click('[data-testid="cancel-submit"]');
  await admin.waitForSelector('[data-testid="cancel-received"]', { timeout: 20000 }).catch(async () => {
    console.log("DEBUG body:", (await admin.textContent("body")).replace(/\s+/g, " ").slice(0, 900), admin.url());
    throw new Error("cancel-received never appeared");
  });
  check("Admin sees the request confirmation", true);
  check("Stripe renewal was switched off", subs.get("sub_bw").cancel_at_period_end === true && stripeCalls.some((c) => c.method === "POST" && c.path === "/v1/subscriptions/sub_bw" && c.params.cancel_at_period_end === "true"));
  check("Subscription not cancelled early (access kept to period end)", subs.get("sub_bw").status === "active");
  const row = (await q("SELECT * FROM academies WHERE slug='brightwave'"))[0];
  check("Request is recorded with reason, billing state and access date", !!row.cancellation_requested_at && row.cancellation_billing === "stopped" && row.cancellation_reason.includes("Too expensive") && !!row.cancellation_access_until);
  check("Email delivery is recorded", !!row.cancellation_notified_at);
  const superEmails = (await q("SELECT email FROM super_admins")).map((r) => r.email.toLowerCase());
  const toPlatform = mails.filter((m) => /^Cancelled: .* has cancelled their subscription$/.test(m.subject));
  check("academyadmin@essesystems.co.uk is emailed", toPlatform.some((m) => [].concat(m.to).map((x) => x.toLowerCase()).includes("academyadmin@essesystems.co.uk")));
  check("Email includes requester name, academy name and contact details", toPlatform[0] && /Cancelled by: Brightwave Admin/.test(toPlatform[0].text) && toPlatform[0].text.includes("Academy: Brightwave Consulting Academy") && toPlatform[0].text.includes("Their email: admin@brightwave.example") && /Academy contact email: \S+@\S+/.test(toPlatform[0].text));
  const archiveAt = row.cancellation_archive_at && new Date(row.cancellation_archive_at).getTime();
  check("Archive is scheduled 24 hours after the request", Math.abs(archiveAt - (new Date(row.cancellation_requested_at).getTime() + 24 * 3600 * 1000)) < 2000);
  check("Email states the archive time", /archived automatically at .* 24 hours after the request/.test(toPlatform[0].text));
  check("Every super admin was emailed", superEmails.every((e) => toPlatform.some((m) => [].concat(m.to).map((x) => x.toLowerCase()).includes(e))), JSON.stringify(toPlatform.map((m) => m.to)));
  check("Email names the academy, requester, plan and reason", toPlatform[0] && /Bright/i.test(toPlatform[0].subject + toPlatform[0].text) && toPlatform[0].text.includes("admin@brightwave.example") && toPlatform[0].text.includes("Too expensive") && /no further payments/i.test(toPlatform[0].text));
  check("Reason is HTML-escaped in the email", toPlatform[0].html.includes("&lt;b&gt;for us&lt;/b&gt;") && !toPlatform[0].html.includes("<b>for us</b>"));
  check("Requester got a receipt", mails.some((m) => [].concat(m.to).includes("admin@brightwave.example") && /received your request/.test(m.subject)));

  // Pending state UI
  check("Billing page shows the pending state and hides payment sections", (await admin.locator('[data-testid="cancel-pending"]').count()) === 1 && (await admin.locator('[data-testid="cancel-form"]').count()) === 0 && !visible(await admin.content()).includes("Activate your subscription") && !visible(await admin.content()).includes("Change plan"));
  await admin.goto(BASE + "/a/brightwave/admin");
  check("Admin dashboard shows the notice", (await admin.locator('[data-testid="dash-cancel-notice"]').count()) === 1);

  // Server-side guard: a stale tab opened before the request can't start a payment
  await stale.locator('form:has(select[name="plan"]) button[type=submit]').first().click();
  await stale.waitForTimeout(2500);
  check("A stale checkout form is refused server-side", (await stale.textContent("body")).includes("asked to cancel"), (await stale.textContent("body")).slice(0, 0));

  // Super admin sees it
  await sa.goto(BASE + "/super-admin");
  check("Super admin dashboard lists the request", (await sa.locator('[data-testid="cancel-requests-card"]').count()) === 1);
  await sa.goto(BASE + "/super-admin/academies");
  const card = sa.locator('[data-testid="cancel-request"]').first();
  check("Academies page shows request first with reason", (await card.count()) === 1 && (await card.textContent()).includes("Too expensive") && (await card.textContent()).includes("Platform email sent"));

  // Webhook: someone resumes renewal elsewhere → we switch it off again
  stripeCalls.length = 0;
  subs.get("sub_bw").cancel_at_period_end = false;
  const stripe = new Stripe("sk_test_fake");
  const payload = JSON.stringify({ id: "evt_resume_" + Date.now(), object: "event", type: "customer.subscription.updated", data: { object: { ...subs.get("sub_bw") } } });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_fake" });
  const wh = await fetch(BASE + "/api/webhooks/stripe", { method: "POST", headers: { "stripe-signature": header, "content-type": "application/json" }, body: payload });
  check("Webhook accepted", wh.status === 200, String(wh.status));
  check("Renewal switched off again after being resumed elsewhere", subs.get("sub_bw").cancel_at_period_end === true && stripeCalls.some((c) => c.method === "POST" && c.params.cancel_at_period_end === "true"));

  // Withdraw
  mails.length = 0;
  await admin.goto(BASE + "/a/brightwave/admin/billing");
  await admin.click('[data-testid="withdraw-submit"]');
  await admin.waitForSelector('[data-testid="cancel-withdrawn"]', { timeout: 20000 });
  check("Withdrawal switches renewal back on and clears the request", subs.get("sub_bw").cancel_at_period_end === false && (await q("SELECT cancellation_requested_at AS c FROM academies WHERE slug='brightwave'"))[0].c === null);
  check("Withdrawal also cancels the scheduled archive", (await q("SELECT cancellation_archive_at AS a FROM academies WHERE slug='brightwave'"))[0].a === null);
  check("Platform was told about the withdrawal", mails.some((m) => /withdrawn/i.test(m.subject)));
  check("Cancel form is back", (await admin.locator('[data-testid="cancel-form"]').count()) === 1);

  // Request again, then super admin deletes: subscription ends now
  await admin.check('[data-testid="cancel-confirm"]');
  await admin.click('[data-testid="cancel-submit"]');
  await admin.waitForSelector('[data-testid="cancel-received"]', { timeout: 20000 });
  stripeCalls.length = 0;
  await sa.goto(BASE + "/super-admin/academies");
  const bw = sa.locator('div.app-card').filter({ hasText: "skillsacademy.ai/a/brightwave" }).first();
  await bw.locator('button:has-text("Delete Academy")').click();
  await sa.waitForLoadState("networkidle");
  check("Deleting the academy ends its Stripe subscription immediately", subs.get("sub_bw").status === "canceled" && stripeCalls.some((c) => c.method === "DELETE" && c.path === "/v1/subscriptions/sub_bw"));
  check("Academy is soft-deleted", (await q("SELECT is_deleted FROM academies WHERE slug='brightwave'"))[0].is_deleted === 1);
  // restore clears the request
  await sa.locator("details summary").first().click();
  await sa.locator('button:has-text("Restore Academy")').first().click();
  await sa.waitForTimeout(1500);
  const restored = (await q("SELECT is_deleted, cancellation_requested_at AS c FROM academies WHERE slug='brightwave'"))[0];
  check("Restoring brings it back and clears the old request", restored.is_deleted === 0 && restored.c === null, JSON.stringify(restored));

  // Trial academy with no Stripe subscription
  mails.length = 0;
  const admin2 = await ctx2.newPage();
  await login(admin2, "/a/northgate/login", "admin@northgate.example", "Password123!");
  await admin2.goto(BASE + "/a/northgate/admin/billing");
  await admin2.check('[data-testid="cancel-confirm"]');
  await admin2.click('[data-testid="cancel-submit"]');
  await admin2.waitForSelector('[data-testid="cancel-received"]', { timeout: 20000 });
  const ng = (await q("SELECT * FROM academies WHERE slug='northgate'"))[0];
  check("Trial academy: request recorded with nothing to stop", ng.cancellation_billing === "none" && !!ng.cancellation_requested_at);
  check("Trial academy: platform email says no paid subscription", mails.some((m) => /^Cancelled: /.test(m.subject) && /free trial/.test(m.text)));

  // ===== Part 3: automatic archive after 24 hours =====
  const { default: archiveHandler } = await import("../netlify/functions/archive-cancelled.mjs");
  process.env.ARCHIVE_CRON_BASE_URL = BASE;
  const cronUrl = BASE + "/api/cron/archive-cancelled";
  check("Cron route refuses a missing or wrong token", (await fetch(cronUrl, { method: "POST" })).status === 401 && (await fetch(cronUrl, { method: "POST", headers: { authorization: "Bearer nope" } })).status === 401);

  // Not due yet: nothing happens (northgate asked just now)
  await archiveHandler();
  check("Not archived before 24 hours are up", (await q("SELECT is_deleted FROM academies WHERE slug='northgate'"))[0].is_deleted === 0);

  // Make northgate's 24 hours be up
  await q("UPDATE academies SET cancellation_archive_at = $1 WHERE slug='northgate'", [new Date(Date.now() - 3600 * 1000).toISOString()]);

  // 24 hours later: the scheduled function archives it
  stripeCalls.length = 0; mails.length = 0;
  await q("UPDATE academies SET stripe_customer_id='cus_ng', stripe_subscription_id='sub_ng' WHERE slug='northgate'");
  resetSub("sub_ng", "cus_ng");
  await archiveHandler();
  const ng2 = (await q("SELECT * FROM academies WHERE slug='northgate'"))[0];
  check("Due academy is archived by the scheduled function", ng2.is_deleted === 1 && !!ng2.cancellation_archived_at);
  check("Its Stripe subscription is ended", subs.get("sub_ng").status === "canceled");
  check("Archive email goes to academyadmin@essesystems.co.uk", mails.some((m) => /^Archived: /.test(m.subject) && [].concat(m.to).includes("academyadmin@essesystems.co.uk")));
  const gone = await fetch(BASE + "/a/northgate", { redirect: "manual" });
  check("Archived academy's public site is gone", gone.status === 404, String(gone.status));
  await archiveHandler();
  check("Running again doesn't archive or email twice", mails.filter((m) => /^Archived: /.test(m.subject) && [].concat(m.to).includes("academyadmin@essesystems.co.uk")).length === 1);
  await sa.goto(BASE + "/super-admin/academies");
  await sa.locator("details summary").first().click();
  check("Super admin sees it as archived after cancellation", (await sa.locator('[data-testid="archived-label"]').count()) >= 1);

  // Safety net: loading Super Admin also archives anything overdue
  await q("UPDATE academies SET cancellation_requested_at=$1, cancellation_archive_at=$2, cancellation_billing='none', cancellation_archived_at=NULL WHERE slug='riverside'", [new Date(Date.now() - 25 * 3600 * 1000).toISOString(), new Date(Date.now() - 3600 * 1000).toISOString()]);
  await sa.goto(BASE + "/super-admin");
  check("Overdue academy is archived when Super Admin loads", (await q("SELECT is_deleted FROM academies WHERE slug='riverside'"))[0].is_deleted === 1);

  // Restore clears the archive state
  await q("UPDATE academies SET is_deleted=0 WHERE slug='riverside'");

  await browser.close();
  stripeServer.close(); mailServer.close(); await db.end();
  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(2); });
