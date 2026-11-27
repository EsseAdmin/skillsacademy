// Browser/HTTP end-to-end test for pass 50 (security hardening). Run against a started app on the seeded database,
// started WITH AUTH_SECRET set to the value passed here:
//   AUTH_SECRET=sec-test-key npx next start -p 3180
//   SEC_TEST_BASE_URL=http://localhost:3180 SEC_TEST_SECRET=sec-test-key DATABASE_URL=postgres://… node scripts/security-e2e.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const pg = require("pg");
const { SignJWT } = require("jose");

const BASE = process.env.SEC_TEST_BASE_URL || "http://localhost:3180";
const SECRET = process.env.SEC_TEST_SECRET || "sec-test-key";
const SLUG = "brightwave";
let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail ? " :: " + detail : ""}`);
}
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  return page;
}
async function tryLogin(page, email, pwd) {
  await page.goto(`${BASE}/a/${SLUG}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', pwd);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(900);
}
async function login(page, email, pwd = "Password123!") {
  await page.goto(`${BASE}/a/${SLUG}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', pwd);
  await Promise.all([page.waitForURL(/\/(admin|instructor|learner)/), page.click('button[type="submit"]')]);
}

try {
  await db.query("DELETE FROM auth_attempts").catch(() => {});
  const users = (await db.query("SELECT id, email, role FROM users WHERE academy_id = (SELECT id FROM academies WHERE slug = $1) ORDER BY role, email", [SLUG])).rows;
  const learners = users.filter((u) => u.role === "LEARNER");
  const instructor = users.find((u) => u.role === "INSTRUCTOR");
  const admin = users.find((u) => u.role === "ACADEMY_ADMIN");
  check("seeded users found", learners.length >= 2 && !!instructor && !!admin);

  // ----- headers -----
  const res = await fetch(`${BASE}/`);
  const h = res.headers;
  check("security headers are sent", !!h.get("strict-transport-security") && h.get("x-content-type-options") === "nosniff" && h.get("x-frame-options") === "SAMEORIGIN" && !!h.get("referrer-policy") && !!h.get("permissions-policy"), [...h.keys()].join(","));
  check("X-Powered-By is not sent", !h.get("x-powered-by"));

  // ----- sign-in throttle -----
  const v = await newPage();
  const target = learners[0].email;
  for (let i = 0; i < 8; i++) await tryLogin(v, target, "wrong-password-" + i);
  const before = await v.locator("body").innerText();
  check("wrong passwords get the normal message", /incorrect|invalid/i.test(before), before.slice(0, 120));
  await tryLogin(v, target, "wrong-again");
  check("the 9th attempt is refused as too many", /too many attempts/i.test(await v.locator("body").innerText()));
  await tryLogin(v, target, "Password123!");
  check("even the right password is refused while locked", /too many attempts/i.test(await v.locator("body").innerText()) && /login/.test(v.url()));
  const other = await newPage();
  await login(other, learners[1].email);
  check("other accounts are not affected by that lock", /learner/.test(other.url()));
  await other.context().close();
  await v.context().close();

  // ----- no-such-account answers like a wrong password -----
  const g = await newPage();
  await tryLogin(g, "nobody-here@example.com", "whatever123");
  check("unknown email gets the same message", /incorrect|invalid/i.test(await g.locator("body").innerText()));
  await g.context().close();

  // ----- password-reset emails are capped -----
  await db.query("DELETE FROM auth_attempts");
  const r = await newPage();
  for (let i = 0; i < 5; i++) {
    await r.goto(`${BASE}/a/${SLUG}/forgot-password`);
    await r.fill('input[name="email"]', admin.email);
    await r.click('button[type="submit"]');
    await r.waitForTimeout(700);
  }
  const counted = (await db.query("SELECT count(*)::int AS n FROM auth_attempts WHERE bucket LIKE 'reset-acct:%'")).rows[0].n;
  check("only 3 reset requests per address per hour are processed", counted === 3, String(counted));
  check("the form still answers generically when limited", /link|enlace|lien/i.test(await r.locator("body").innerText()));
  await r.context().close();
  await db.query("DELETE FROM auth_attempts");

  // ----- forged cookies -----
  const forge = async (secret, alg = "HS256") =>
    new SignJWT({ userId: admin.id, role: "ACADEMY_ADMIN", academyId: "x", academySlug: SLUG, name: "x", email: admin.email })
      .setProtectedHeader({ alg }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(secret));
  const f = await newPage();
  const ctx = f.context();
  await ctx.addCookies([{ name: "sa_session", value: await forge("the-public-fallback-key"), url: BASE }]);
  await f.goto(`${BASE}/a/${SLUG}/admin`);
  check("a cookie signed with the wrong key does not open the admin area", /login/.test(f.url()), f.url());
  const none = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url") + "." + Buffer.from(JSON.stringify({ userId: admin.id, role: "ACADEMY_ADMIN", academySlug: SLUG, exp: 9999999999 })).toString("base64url") + ".";
  await ctx.addCookies([{ name: "sa_session", value: none, url: BASE }]);
  await f.goto(`${BASE}/a/${SLUG}/admin`);
  check("an unsigned (alg none) cookie is refused", /login/.test(f.url()), f.url());
  await ctx.close();

  // ----- sessions end when the account is deactivated or its password changes -----
  const inst = await newPage();
  await login(inst, instructor.email);
  const lrn = await newPage();
  await login(lrn, learners[1].email);
  await inst.goto(`${BASE}/a/${SLUG}/instructor`);
  await lrn.goto(`${BASE}/a/${SLUG}/learner`);
  check("signed-in pages open normally", /instructor/.test(inst.url()) && /learner/.test(lrn.url()));
  const oldHash = (await db.query("SELECT password_hash FROM users WHERE id=$1", [learners[1].id])).rows[0].password_hash;
  await db.query("UPDATE users SET is_active = 0 WHERE id = $1", [instructor.id]);
  await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [oldHash.slice(0, -3) + "abc", learners[1].id]);
  await new Promise((res) => setTimeout(res, 32000));
  await inst.goto(`${BASE}/a/${SLUG}/instructor`);
  check("a deactivated account's open session stops working", /login/.test(inst.url()), inst.url());
  await lrn.goto(`${BASE}/a/${SLUG}/learner`);
  check("a changed password signs the account out elsewhere", /login/.test(lrn.url()), lrn.url());
  await db.query("UPDATE users SET is_active = 1 WHERE id = $1", [instructor.id]);
  await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [oldHash, learners[1].id]);
  await inst.context().close();
  await lrn.context().close();

  // ----- logout can't be turned into an open redirect -----
  const lo = await newPage();
  await login(lo, admin.email);
  await lo.goto(`${BASE}/a/${SLUG}/admin`);
  const formLoc = lo.locator('form:has(input[name="redirectTo"])').first();
  if ((await formLoc.count()) > 0) {
    await lo.evaluate(() => { document.querySelector('input[name="redirectTo"]').value = "https://evil.example/phish"; });
    await Promise.all([lo.waitForLoadState("load"), formLoc.locator('button[type="submit"]').first().click()]);
    await lo.waitForTimeout(1200);
    check("logout with a hostile redirectTo stays on this site", new URL(lo.url()).origin === new URL(BASE).origin, lo.url());
  } else check("logout form found", false);
  await lo.context().close();

  // ----- share image route only serves pictures -----
  const course = (await db.query("SELECT id FROM courses WHERE academy_id=(SELECT id FROM academies WHERE slug=$1) LIMIT 1", [SLUG])).rows[0];
  await db.query("UPDATE courses SET seo_og_image_path = 'og-images/evil.html' WHERE id = $1", [course.id]);
  const og = await fetch(`${BASE}/api/courses/${course.id}/og-image`);
  check("a non-picture stored as a share image is never served", og.status === 404, String(og.status));
  await db.query("UPDATE courses SET seo_og_image_path = NULL WHERE id = $1", [course.id]);
} catch (e) {
  failures++;
  console.log("FAIL - exception", e);
} finally {
  await browser.close();
  await db.end();
}
console.log(failures ? `${failures} security e2e check(s) FAILED` : "All security e2e checks passed.");
process.exit(failures ? 1 : 0);
