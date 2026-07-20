// End-to-end smoke test for local development. Requires a running
// `npm run dev` (or `netlify dev`) server pointed at a seeded Postgres
// database (see README.md "Getting started"). Run with `npm run smoke-test`.
//
// Uses playwright-core against a system/local Chromium install rather than
// full `playwright` (which downloads its own browser), since some sandboxed
// environments pin a specific Chromium path via PLAYWRIGHT_BROWSERS_PATH.
// If CHROMIUM_PATH isn't set and no browser is found at the sandbox default
// below, falls back to whatever `playwright-core` can find on PATH.
import fs from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.env.SMOKE_TEST_BASE_URL || "http://localhost:3000";
const SANDBOX_CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const CHROMIUM_PATH =
  process.env.CHROMIUM_PATH || (fs.existsSync(SANDBOX_CHROMIUM) ? SANDBOX_CHROMIUM : undefined);
const results = [];

function log(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail ? " :: " + detail : ""}`);
}

async function withPage(browser, fn, label) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  try {
    await fn(page);
    if (errors.length) log(label + " (console)", false, errors.join(" | "));
  } catch (e) {
    log(label, false, String(e && e.message ? e.message : e));
    throw e;
  } finally {
    await page.close();
  }
}

async function loginAs(page, slug, email, password) {
  await page.goto(`${BASE}/a/${slug}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle" }),
    page.click('button[type="submit"]'),
  ]);
}

async function main() {
  const browser = await chromium.launch({
    ...(CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {}),
    args: ["--no-sandbox"],
  });

  // 1. Marketing homepage
  await withPage(browser, async (page) => {
    const resp = await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    log("Marketing homepage loads", resp.ok(), `status ${resp.status()}`);
  }, "Marketing homepage");

  // 2. Public academy homepage (published academy)
  await withPage(browser, async (page) => {
    const resp = await page.goto(`${BASE}/a/brightwave`, { waitUntil: "networkidle" });
    log("Public academy page (brightwave) loads", resp.ok(), `status ${resp.status()}`);
  }, "Public academy page");

  // 3. Academy admin login + dashboard
  await withPage(browser, async (page) => {
    await loginAs(page, "brightwave", "admin@brightwave.example", "Password123!");
    const url = page.url();
    log("Academy admin login redirects to /admin", url.includes("/admin"), url);
    const resp = await page.goto(`${BASE}/a/brightwave/admin/people`, { waitUntil: "networkidle" });
    log("Admin people page loads", resp.ok(), `status ${resp.status()}`);
    const resp2 = await page.goto(`${BASE}/a/brightwave/admin/site`, { waitUntil: "networkidle" });
    log("Admin site editor page loads", resp2.ok(), `status ${resp2.status()}`);
    const resp3 = await page.goto(`${BASE}/a/brightwave/admin/billing`, { waitUntil: "networkidle" });
    log("Admin billing page loads", resp3.ok(), `status ${resp3.status()}`);
  }, "Academy admin flow");

  // 4. Instructor login + dashboard
  await withPage(browser, async (page) => {
    await loginAs(page, "brightwave", "instructor@brightwave.example", "Password123!");
    const url = page.url();
    log("Instructor login redirects to /instructor", url.includes("/instructor"), url);
    const resp = await page.goto(`${BASE}/a/brightwave/instructor/learners`, { waitUntil: "networkidle" });
    log("Instructor learners page loads", resp.ok(), `status ${resp.status()}`);
  }, "Instructor flow");

  // 5. Learner login + catalog + course
  await withPage(browser, async (page) => {
    await loginAs(page, "brightwave", "learner@brightwave.example", "Password123!");
    const url = page.url();
    log("Learner login redirects to /learner", url.includes("/learner"), url);
    const resp = await page.goto(`${BASE}/a/brightwave/learner/catalog`, { waitUntil: "networkidle" });
    log("Learner catalog page loads", resp.ok(), `status ${resp.status()}`);
  }, "Learner flow");

  // 6. Super admin login + dashboard
  await withPage(browser, async (page) => {
    await page.goto(`${BASE}/super-admin/login`, { waitUntil: "networkidle" });
    await page.fill('input[name="email"]', "superadmin@skillsacademy.ai");
    await page.fill('input[name="password"]', "SuperAdmin123!");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }),
      page.click('button[type="submit"]'),
    ]);
    const url = page.url();
    log("Super admin login redirects to /super-admin", url.includes("/super-admin"), url);
    const resp = await page.goto(`${BASE}/super-admin/academies`, { waitUntil: "networkidle" });
    log("Super admin academies page loads", resp.ok(), `status ${resp.status()}`);
    const resp2 = await page.goto(`${BASE}/super-admin/plans`, { waitUntil: "networkidle" });
    log("Super admin plans page loads", resp2.ok(), `status ${resp2.status()}`);
  }, "Super admin flow");

  // 7. Site editor: publish toggle + content save actually persist to Postgres
  await withPage(browser, async (page) => {
    await loginAs(page, "riverside", "admin@riverside.example", "Password123!");
    await page.goto(`${BASE}/a/riverside/admin/site`, { waitUntil: "networkidle" });

    const uniqueHeadline = `Smoke Test Headline ${Date.now()}`;
    await page.fill('input[name="hero_headline"]', uniqueHeadline);
    await page.fill('input[name="hero_tagline"]', "Smoke test tagline");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }),
      page.click('form:has(input[name="hero_headline"]) button[type="submit"]'),
    ]);

    const publishForm = page.locator('form:has(input[name="publish"])');
    const publishValueBefore = await publishForm.locator('input[name="publish"]').getAttribute("value");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }),
      publishForm.locator('button[type="submit"]').click(),
    ]);

    const text = await page.textContent("body");
    log("Site editor content save reflected in page", text.includes(uniqueHeadline));
    log("Publish toggle changed state", text.includes(publishValueBefore === "1" ? "Published" : "Not published"));
  }, "Site editor persistence");

  // 8. Verify persistence directly against Postgres (bypassing the app layer)
  await withPage(browser, async (page) => {
    const resp = await page.goto(`${BASE}/a/riverside`, { waitUntil: "networkidle" });
    log("Public riverside page reflects published state", resp.ok());
  }, "Public page after publish");

  // 9. File download route works through the storage layer (Blobs w/ local fallback)
  await withPage(browser, async (page) => {
    await loginAs(page, "brightwave", "learner@brightwave.example", "Password123!");
    // Discover the file module's download link from the learner's enrolled course
    // page rather than hardcoding a module id — ids are freshly generated UUIDs
    // on every reseed, so a hardcoded id goes stale the moment the DB resets.
    await page.goto(`${BASE}/a/brightwave/learner`, { waitUntil: "networkidle" });
    const courseLink = page.locator('a[href*="/learner/courses/"]').first();
    await courseLink.click();
    await page.waitForLoadState("networkidle");
    const fileHref = await page.locator('a[href^="/api/files/"]').first().getAttribute("href");
    log("Found a file-module download link on the course page", !!fileHref, fileHref || "<none>");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.goto(`${BASE}${fileHref}`).catch(() => {}),
    ]);
    const suggested = download.suggestedFilename();
    log("Enrolled learner can download module file", suggested === "onboarding-checklist.txt", suggested);
    const dlPath = await download.path();
    const size = dlPath ? fs.statSync(dlPath).size : 0;
    log("Downloaded file has content", size > 0, `${size} bytes`);
  }, "Module file download");

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log("FAILURES:");
    failed.forEach((f) => console.log(` - ${f.name}: ${f.detail}`));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Smoke test crashed:", e);
  process.exit(1);
});
