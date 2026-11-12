// Browser check of complimentary (free) academies. Start the app on a fresh seeded database (default addresses, no
// SUPER_ADMIN_PATH), then: BASE=http://localhost:4072 DATABASE_URL=postgres://... node scripts/complimentary-e2e.mjs
import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";
const B = process.env.BASE || "http://localhost:4072";
const DB = process.env.DATABASE_URL;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
let fails = 0;
const ok = (n, c, d = "") => { console.log((c ? "PASS" : "FAIL") + " - " + n + (!c && d ? " :: " + d : "")); if (!c) fails++; };
const sql = (q) => execFileSync("psql", [DB, "-qAt", "-c", q]).toString().trim();
const dayFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

async function login(ctx, url, email, password) {
  const p = await ctx.newPage();
  await p.goto(B + url, { waitUntil: "networkidle" });
  await p.fill("input[name=email]", email);
  await p.fill("input[name=password]", password);
  await p.click("button[type=submit]");
  await p.waitForURL((u) => !u.pathname.endsWith("/login"), { waitUntil: "commit", timeout: 15000 });
  await p.waitForLoadState("networkidle");
  return p;
}
const settle = (p) => p.waitForLoadState("networkidle").then(() => p.waitForTimeout(400));
const card = (p, slug) => p.locator(".app-card", { hasText: `skillsacademy.ai/a/${slug}` }).filter({ has: p.locator('[data-testid="complimentary-section"]') });

const sctx = await b.newContext();
const sa = await login(sctx, "/super-admin/login", "superadmin@skillsacademy.ai", "SuperAdmin123!");
const actx = await b.newContext();
const ad = await login(actx, "/a/brightwave/login", "admin@brightwave.example", "Password123!");
const rctx = await b.newContext();
const rv = await login(rctx, "/a/riverside/login", "admin@riverside.example", "Password123!");

// Before: normal trial/subscribe prompts
await ad.goto(B + "/a/brightwave/admin/billing", { waitUntil: "networkidle" });
ok("before: no complimentary banner and the subscribe form is offered", (await ad.locator('[data-testid="complimentary-banner"]').count()) === 0 && /Activate your subscription|Change plan/.test(await ad.content()));

// Super admin: bad date refused
await sa.goto(B + "/super-admin/academies", { waitUntil: "networkidle" });
let c = card(sa, "brightwave");
ok("each academy has the free-access control, collapsed by default", (await c.locator('[data-testid="complimentary-section"]').count()) === 1 && /Make this academy free/.test(await c.locator("summary").first().innerText()));
await c.locator('[data-testid="complimentary-section"] summary').click();
await c.locator('[data-testid="complimentary-mode"]').selectOption("until");
await c.locator('[data-testid="complimentary-until"]').fill(dayFromNow(-2));
await c.locator('[data-testid="complimentary-grant"]').click();
await sa.waitForSelector('[data-testid="complimentary-error"]', { timeout: 10000 });
ok("a past end date is refused with a message", /must be in the future/.test(await sa.locator('[data-testid="complimentary-error"]').innerText()));
ok("…and nothing was granted", sql("select is_complimentary from academies where slug='brightwave'") === "0");

// Grant unlimited
await sa.goto(B + "/super-admin/academies", { waitUntil: "networkidle" });
c = card(sa, "brightwave");
await c.locator('[data-testid="complimentary-section"] summary').click();
await c.locator('[data-testid="complimentary-mode"]').selectOption("unlimited");
await c.locator('input[name=note]').fill("Charity partner");
await c.locator('[data-testid="complimentary-grant"]').click();
await settle(sa);
c = card(sa, "brightwave");
ok("granted unlimited: the card shows a Complimentary badge with no end", /Complimentary · no end/.test(await c.locator('[data-testid="complimentary-badge"]').innerText()));
ok("stored as unlimited with the note", sql("select is_complimentary||'|'||coalesce(complimentary_until,'')||'|'||coalesce(complimentary_note,'') from academies where slug='brightwave'") === "1||Charity partner");

// Academy admin view
await ad.goto(B + "/a/brightwave/admin", { waitUntil: "networkidle" });
ok("the academy admin sees a friendly banner (no end date)", /complimentary access — no payment is needed/.test(await ad.locator('[data-testid="complimentary-banner"]').innerText()));
ok("the dashboard shows Complimentary / No end date", /Complimentary/.test(await ad.locator("body").innerText()) && /No end date/.test(await ad.locator("body").innerText()));
await ad.goto(B + "/a/brightwave/admin/billing", { waitUntil: "networkidle" });
const bill = await ad.locator("body").innerText();
ok("billing says there is nothing to pay and hides subscribe / switch plan", /nothing to pay/.test(bill) && !/Activate your subscription/.test(bill) && !/Switch plan/.test(bill) && (await ad.locator('[data-testid="complimentary-card"]').count()) === 1);
ok("the note is private to the Super Admin", !/Charity partner/.test(bill));
await rv.goto(B + "/a/riverside/admin", { waitUntil: "networkidle" });
ok("another academy is unaffected", (await rv.locator('[data-testid="complimentary-banner"]').count()) === 0);

// Dashboard counts
await sa.goto(B + "/super-admin", { waitUntil: "networkidle" });
const dash = await sa.locator("body").innerText();
ok("Super Admin overview counts it under Complimentary", /1\s*\n?\s*Complimentary/.test(dash), dash.slice(0, 300));

// Change to a dated period
await sa.goto(B + "/super-admin/academies", { waitUntil: "networkidle" });
c = card(sa, "brightwave");
await c.locator('[data-testid="complimentary-section"] summary').click();
await c.locator('[data-testid="complimentary-mode"]').selectOption("until");
await c.locator('[data-testid="complimentary-until"]').fill(dayFromNow(30));
await c.locator('[data-testid="complimentary-grant"]').click();
await settle(sa);
c = card(sa, "brightwave");
ok("changed to a dated period: badge shows the date", /Complimentary · until/.test(await c.locator('[data-testid="complimentary-badge"]').innerText()));
await ad.goto(B + "/a/brightwave/admin", { waitUntil: "networkidle" });
ok("the academy admin's banner now shows the end date", /complimentary access until/.test(await ad.locator('[data-testid="complimentary-banner"]').innerText()));

// The period runs out: back to normal, with nothing running
if (DB) {
  sql("update academies set complimentary_until='2020-01-01T23:59:59.999Z' where slug='brightwave'");
  await ad.goto(B + "/a/brightwave/admin/billing", { waitUntil: "networkidle" });
  const t = await ad.locator("body").innerText();
  ok("when the dated period has ended the normal billing screen is back", (await ad.locator('[data-testid="complimentary-banner"]').count()) === 0 && /Activate your subscription|Change plan/.test(t));
  await sa.goto(B + "/super-admin/academies", { waitUntil: "networkidle" });
  c = card(sa, "brightwave");
  ok("…and the Super Admin sees that it ended", /ended .* grant again/.test(await c.locator("summary").first().innerText()));
  sql("update academies set complimentary_until=null where slug='brightwave'");
}

// Revoke
await sa.goto(B + "/super-admin/academies", { waitUntil: "networkidle" });
c = card(sa, "brightwave");
await c.locator('[data-testid="complimentary-section"] summary').click();
await c.locator('[data-testid="complimentary-revoke"]').click();
await settle(sa);
ok("removing free access clears the badge", (await card(sa, "brightwave").locator('[data-testid="complimentary-badge"]').count()) === 0);
await ad.goto(B + "/a/brightwave/admin/billing", { waitUntil: "networkidle" });
ok("the academy is back to normal billing", (await ad.locator('[data-testid="complimentary-banner"]').count()) === 0 && /Activate your subscription|Change plan/.test(await ad.content()));

// Only the Super Admin has the controls
await ad.goto(B + "/a/brightwave/admin/billing", { waitUntil: "networkidle" });
ok("the academy admin never sees any free-access control", !/Grant free access|Remove free access/.test(await ad.content()));
const resp = await actx.request.get(B + "/super-admin/academies", { maxRedirects: 0 });
ok("an academy admin can't open the Super Admin academies page", resp.status() >= 300 && resp.status() < 400);

await b.close();
console.log(fails ? `\n${fails} FAILED` : "\nAll passed");
process.exit(fails ? 1 : 0);
