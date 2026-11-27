// Browser end-to-end test for the Terms & Conditions step of the sign-up wizard and the public /terms page.
// Start the app with the four TERMS_* variables set, then:
//   TERMS_TEST_BASE_URL=http://localhost:3190 DATABASE_URL=postgres://… node scripts/terms-e2e.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const pg = require("pg");

const BASE = process.env.TERMS_TEST_BASE_URL || "http://localhost:3190";
let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail ? " :: " + detail : ""}`);
}
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);

async function toStep4(org) {
  await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
  await page.fill('input[placeholder="e.g. Brightwave Consulting"]', org);
  await page.click('button:has-text("Continue")');
  await page.click('button:has-text("Continue")');
  await page.locator(".tier-card").first().click();
  await page.click('button:has-text("Continue")');
}

try {
  // ----- public page -----
  await page.goto(`${BASE}/terms`);
  const body = await page.locator('[data-testid="terms-page"]').innerText();
  check("/terms shows the terms", /About these terms/.test(body) && /Governing law and courts/.test(body) && /Contact us/.test(body));
  check("/terms shows the company details from the environment", /Terms Test Ltd/.test(body) && /legal@terms-test\.example/.test(body));
  check("no draft notice once the details are set", (await page.locator('[data-testid="terms-draft-notice"]').count()) === 0);
  check("/terms shows the version", /Version 1\.0/.test(await page.locator("body").innerText()));

  // ----- wizard: five steps -----
  const org = `Terms Test Org ${Date.now()}`;
  await toStep4(org);
  const steps = await page.locator("body").innerText();
  check("the step bar lists five steps ending in Terms & Conditions", /4\s*Your Account/.test(steps) && /5\s*Terms & Conditions/.test(steps));
  check("sign-up page says five quick steps", /Five quick steps/.test(steps));

  // step 4 will not move on until the account details are valid
  await page.click('[data-testid="to-terms"]');
  check("Continue on step 4 with empty details stays on step 4", await page.locator('input[name="adminName"]').isVisible() && !(await page.locator('[data-testid="terms-box"]').isVisible()));
  await page.fill('input[name="adminName"]', "Terms Admin");
  const email = `terms-${Date.now()}@gmail.com`;
  await page.fill('input[name="adminEmail"]', email);
  await page.fill('input[name="password"]', "TestPass123!");
  await page.click('[data-testid="to-terms"]');
  check("with valid details Continue shows step 5", await page.locator('[data-testid="terms-box"]').isVisible());
  check("step 4's fields are hidden but still in the form", !(await page.locator('input[name="adminName"]').isVisible()) && (await page.locator('input[name="adminName"]').inputValue()) === "Terms Admin");

  // step 5: read to the end, tick, create
  const accept = page.locator('[data-testid="terms-accept"]');
  const create = page.locator('button[type="submit"]');
  check("tick box is disabled until the terms are scrolled to the end", await accept.isDisabled());
  check("Create is disabled before ticking", await create.isDisabled());
  check("the box really scrolls (terms are longer than the box)", await page.locator('[data-testid="terms-box"]').evaluate((el) => el.scrollHeight > el.clientHeight + 50));
  await page.locator('[data-testid="terms-box"]').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.waitForTimeout(300);
  check("scrolling to the end enables the tick box", await accept.isEnabled());
  check("Create is still disabled until it is ticked", await create.isDisabled());
  // back keeps what was typed
  await page.click('[data-testid="terms-step"] button:has-text("Back")');
  check("Back returns to step 4 with the details kept", (await page.locator('input[name="adminEmail"]').inputValue()) === email);
  await page.click('[data-testid="to-terms"]');

  // the server refuses when the tick or version is missing (client controls bypassed)
  await page.locator('[data-testid="terms-box"]').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.evaluate(() => document.querySelector('button[type="submit"]').removeAttribute("disabled"));
  await create.click();
  await page.waitForSelector('[data-testid="signup-error"]');
  check("server refuses an un-ticked submission", /accept the Terms/i.test(await page.locator('[data-testid="signup-error"]').innerText()));
  check("no academy was created by that attempt", (await db.query("SELECT 1 FROM academies WHERE name = $1", [org])).rowCount === 0);
  await page.locator('[data-testid="terms-box"]').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.check('[data-testid="terms-accept"]');
  await page.evaluate(() => { document.querySelector('input[name="termsVersion"]').value = "0.1"; });
  await create.click();
  await page.waitForFunction(() => /just been updated/i.test(document.body.innerText));
  check("server refuses an out-of-date version", true);
  check("still no academy", (await db.query("SELECT 1 FROM academies WHERE name = $1", [org])).rowCount === 0);

  // the proper route
  await page.evaluate(() => { document.querySelector('input[name="termsVersion"]').value = "1.0"; });
  await create.click();
  await page.waitForURL(/\/admin/, { timeout: 30000 }).catch(async () => {
    console.log("DEBUG error text:", await page.locator('[data-testid="signup-error"]').innerText().catch(() => "(none)"), "| disabled:", await create.isDisabled(), "| accepted:", await accept.isChecked());
  });
  check("ticking and creating lands in the new academy", /\/a\/[^/]+\/admin/.test(page.url()), page.url());
  const row = (await db.query("SELECT terms_version, terms_accepted_at, terms_accepted_by FROM academies WHERE name = $1", [org])).rows[0];
  check("the academy records the accepted version, time and who accepted", row?.terms_version === "1.0" && !!row?.terms_accepted_at && row?.terms_accepted_by === email, JSON.stringify(row));
} catch (e) {
  failures++;
  console.log("FAIL - exception", e);
} finally {
  await browser.close();
  await db.end();
}
console.log(failures ? `${failures} terms e2e check(s) FAILED` : "All terms e2e checks passed.");
process.exit(failures ? 1 : 0);
