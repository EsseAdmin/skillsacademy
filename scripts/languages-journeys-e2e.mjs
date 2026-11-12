// Browser end-to-end test for pass 34: academy language (French/Spanish/German/English),
// learning journeys built by an admin and an instructor and shown as a metro map on the
// public home page, and course/module pictures uploaded by an instructor.
// Run against a started app (npx next start -p 3170) on the seeded database:
//   JOURNEY_TEST_BASE_URL=http://localhost:3170 DATABASE_URL=postgres://… node scripts/languages-journeys-e2e.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const pg = require("pg");

const BASE = process.env.JOURNEY_TEST_BASE_URL || "http://localhost:3170";
const SLUG = "brightwave";
let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail ? " :: " + detail : ""}`);
}

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const pngPath = path.join(os.tmpdir(), "lj-e2e-pic.png");
fs.writeFileSync(pngPath, png);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  return page;
}
async function login(page, email, pwd = "Password123!") {
  await page.goto(`${BASE}/a/${SLUG}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', pwd);
  await Promise.all([page.waitForURL(/\/(admin|instructor|learner)/), page.click('button[type="submit"]')]);
}
async function setLanguage(admin, code) {
  await admin.goto(`${BASE}/a/${SLUG}/admin/settings`);
  await admin.selectOption('[data-testid="academy-language"]', code);
  await admin.click('button:has-text("Save Changes")');
  await admin.waitForLoadState("networkidle");
  await admin.waitForTimeout(500);
}

try {
  const { rows: courses } = await db.query("SELECT id, title FROM courses WHERE academy_id = (SELECT id FROM academies WHERE slug = $1) AND is_published = 1 ORDER BY title", [SLUG]);
  check("seeded academy has published courses", courses.length >= 2, String(courses.length));

  // ----- language: sign-up wizard offers the four languages -----
  const visitor = await newPage();
  await visitor.goto(`${BASE}/signup`);
  const opts = await visitor.locator('select[name="language"], [data-testid="signup-language"] option, button[data-lang]').count();
  const wizardText = await visitor.locator("body").innerText();
  check("sign-up wizard offers Français, Español and Deutsch", /Français/.test(wizardText) && /Español/.test(wizardText) && /Deutsch/.test(wizardText), `opts=${opts}`);
  await visitor.context().close();

  // ----- sign-in/register/password pages go back to the ACADEMY's home page -----
  {
    const v = await newPage();
    for (const p of ["login", "register", "forgot-password", "reset-password?token=x", "verify-email"]) {
      await v.goto(`${BASE}/a/${SLUG}/${p}`);
      const href = await v.locator('[data-testid="back-to-academy"]').getAttribute("href");
      check(`/${p.split("?")[0]}: back link goes to the academy home page`, href === `/a/${SLUG}`, href);
      check(`/${p.split("?")[0]}: no link to the SkillsAcademy.ai home page`, (await v.locator('a[href="/"]').count()) === 0);
    }
    await v.setViewport?.call;
    await v.setViewportSize({ width: 390, height: 800 });
    await v.goto(`${BASE}/a/${SLUG}/login`);
    check("phone: back link visible on the login page", await v.locator('[data-testid="back-to-academy-mobile"]').isVisible());
    await Promise.all([v.waitForURL(`${BASE}/a/${SLUG}`), v.click('[data-testid="back-to-academy-mobile"]')]);
    check("clicking it lands on the academy home page", /Brightwave/i.test(await v.locator("body").innerText()));
    await v.context().close();
  }

  // ----- admin switches the academy language -----
  const admin = await newPage();
  await login(admin, `admin@${SLUG}.example`);
  for (const [code, createAccount, signIn, journeyHeading, loginTitle, logout, nav, role] of [
    ["fr", "Créer un compte", "Se connecter", "Découvrez votre parcours", "Bon retour", "Se déconnecter", "Mes formations", "Apprenant"],
    ["es", "Crear cuenta", "Iniciar sesión", "Descubre tu itinerario", "Te damos la bienvenida", "Cerrar sesión", "Mi aprendizaje", "Alumno"],
    ["de", "Konto erstellen", "Anmelden", "Entdecken Sie Ihren Lernweg", "Willkommen zurück", "Abmelden", "Mein Lernen", "Lernende"],
  ]) {
    await setLanguage(admin, code);
    const saved = (await db.query("SELECT language FROM academies WHERE slug = $1", [SLUG])).rows[0].language;
    check(`${code}: setting saved`, saved === code, saved);

    const pub = await newPage();
    await pub.goto(`${BASE}/a/${SLUG}`);
    const home = await pub.locator("body").innerText();
    check(`${code}: public home page is translated`, home.includes(createAccount) && home.includes(signIn) && !home.includes("Create account"), createAccount);
    check(`${code}: page language attribute`, (await pub.locator("[lang]").first().getAttribute("lang")) !== null);
    await pub.goto(`${BASE}/a/${SLUG}/courses/${courses[0].id}`);
    check(`${code}: public course page translated`, !(await pub.locator("body").innerText()).includes("Start Learning"));
    await pub.goto(`${BASE}/a/${SLUG}/login`);
    check(`${code}: login page translated`, (await pub.locator("body").innerText()).includes(loginTitle));
    await pub.fill('input[name="email"]', "nobody@example.com");
    await pub.fill('input[name="password"]', "wrongpassword");
    await pub.click('button[type="submit"]');
    await pub.waitForSelector("p.text-red-600");
    const err = await pub.locator("p.text-red-600").innerText();
    check(`${code}: sign-in error is translated`, !/Invalid email or password/.test(err), err);
    await pub.goto(`${BASE}/a/${SLUG}/register`);
    await pub.fill('input[name="name"]', "Test Learner");
    await pub.fill('input[name="email"]', "tl@example.com");
    await pub.fill('input[name="password"]', "abc123456");
    await pub.fill('input[name="confirmPassword"]', "different1");
    await pub.click('button[type="submit"]');
    await pub.waitForSelector("p.text-red-600");
    check(`${code}: register error translated`, !/match/.test(await pub.locator("p.text-red-600").innerText()));
    await pub.context().close();

    const learner = await newPage();
    await login(learner, `learner@${SLUG}.example`);
    const lt = await learner.locator("body").innerText();
    check(`${code}: learner portal translated (menu, role, Log Out)`, lt.includes(logout) && lt.includes(nav) && lt.includes(role) && !lt.includes("Log Out"), lt.slice(0, 160).replace(/\n/g, " | "));
    await learner.goto(`${BASE}/a/${SLUG}/learner/catalog`);
    check(`${code}: catalog translated`, !(await learner.locator("body").innerText()).includes("Course Catalog"));
    await learner.context().close();

    // admin screens stay English
    await admin.goto(`${BASE}/a/${SLUG}/admin`);
    check(`${code}: admin screens stay English`, (await admin.locator("body").innerText()).includes("Log Out"));
  }

  // ----- journeys: admin builds one -----
  await setLanguage(admin, "en");
  await admin.goto(`${BASE}/a/${SLUG}/admin/journeys`);
  await admin.fill('[data-testid="new-journey-title"]', "Leadership pathways");
  await Promise.all([admin.waitForURL(/\/admin\/journeys\/[^/]+$/), admin.click('[data-testid="create-journey"]')]);
  const editorUrl = admin.url();
  await admin.waitForSelector('[data-testid="journey-editor"]');

  // three stations: a course, a second course, a free-form activity
  for (let i = 0; i < 3; i++) await admin.click('[data-testid="add-station"]');
  await admin.selectOption('[data-testid="station-ref-0"]', courses[0].id);
  await admin.selectOption('[data-testid="station-ref-1"]', courses[1].id);
  check("station title auto-fills from the chosen course", (await admin.inputValue('[data-testid="station-title-0"]')) === courses[0].title);
  await admin.selectOption('[data-testid="station-kind-2"]', "ACTIVITY");
  await admin.fill('[data-testid="station-title-2"]', "Leadership workshop");
  await admin.locator('[data-testid="station-row"]').nth(2).locator('input[placeholder="https://…"]').fill("https://example.com/workshop");
  // two pathways
  await admin.click('[data-testid="add-line"]');
  await admin.click('[data-testid="add-line"]');
  await admin.fill('[data-testid="line-name-0"]', "Middle Leader");
  await admin.fill('[data-testid="line-name-1"]', "Senior Leader");
  const stationValues = await admin.locator('[data-testid="line-add-stop-0"] option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
  check("pathway offers all three stations", stationValues.length === 3);
  await admin.selectOption('[data-testid="line-add-stop-0"]', { index: 1 }); // station 0
  await admin.selectOption('[data-testid="line-add-stop-0"]', { index: 2 }); // (remaining) station 2? picks 2nd of remaining
  await admin.selectOption('[data-testid="line-add-stop-1"]', { index: 2 }); // station 1
  await admin.selectOption('[data-testid="line-add-stop-1"]', { index: 2 }); // of what is left: the workshop, so it sits on both pathways
  check("live preview shows stations on the map", (await admin.locator('[data-testid="journey-station"]').count()) >= 3);
  await admin.check('[data-testid="journey-published"]');
  await admin.click('[data-testid="save-journey"]');
  await admin.waitForSelector('[data-testid="journey-saved"]');
  check("journey saved", true);

  // bad link is refused
  await admin.locator('[data-testid="station-row"]').nth(2).locator('input[placeholder="https://…"]').fill("javascript:alert(1)");
  await admin.click('[data-testid="save-journey"]');
  await admin.waitForSelector('p[role="alert"]');
  check("javascript: link is rejected with a message", /http/.test(await admin.locator('p[role="alert"]').innerText()));
  await admin.locator('[data-testid="station-row"]').nth(2).locator('input[placeholder="https://…"]').fill("https://example.com/workshop");
  await admin.click('[data-testid="save-journey"]');
  await admin.waitForSelector('[data-testid="journey-saved"]');

  // reload keeps everything
  await admin.reload();
  await admin.waitForSelector('[data-testid="journey-editor"]');
  check("journey reloads with its stations and pathways", (await admin.locator('[data-testid="station-row"]').count()) === 3 && (await admin.locator('[data-testid="line-row"]').count()) === 2);

  // ----- public map -----
  const pub = await newPage();
  await pub.goto(`${BASE}/a/${SLUG}`);
  await pub.waitForSelector('[data-testid="journey-map"]');
  check("public home page shows the journey map", (await pub.locator('[data-testid="journey-station"]').count()) >= 3);
  check("legend lists both pathways", (await pub.locator('[data-testid="journey-line-chip"]').count()) === 2);
  check("journey heading", (await pub.locator('[data-testid="journey-section"]').innerText()).toLowerCase().includes("discover your learning journey"));
  await pub.locator('[data-testid="journey-station"]').filter({ hasText: courses[0].title.slice(0, 20) }).first().click();
  const detail = pub.locator('[data-testid="journey-detail"]');
  check("clicking a course station shows details with a View course link", (await detail.innerText()).includes(courses[0].title) && (await pub.locator('[data-testid="journey-station-link"]').getAttribute("href")) === `/a/${SLUG}/courses/${courses[0].id}`);
  await pub.locator('[data-testid="journey-station"][data-station="Leadership workshop"]').focus();
  await pub.keyboard.press("Enter");
  check("keyboard (Enter) selects a station; activity link opens in a new tab", (await pub.locator('[data-testid="journey-station-link"]').getAttribute("href")) === "https://example.com/workshop" && (await pub.locator('[data-testid="journey-station-link"]').getAttribute("target")) === "_blank");
  check("the workshop sits on both pathways (interchange chips)", (await detail.locator("span.text-white").count()) === 2);
  await pub.locator('[data-testid="journey-line-chip"]').first().click();
  check("choosing a pathway chip highlights it", (await pub.locator('[data-testid="journey-line-chip"]').first().getAttribute("aria-pressed")) === "true");
  await pub.setViewportSize({ width: 390, height: 800 });
  const noOverflow = await pub.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
  check("no horizontal page scroll on a phone (map scrolls inside its box)", noOverflow);
  await pub.screenshot({ path: path.join(os.tmpdir(), "journey-mobile.png"), fullPage: false });
  await pub.setViewportSize({ width: 1280, height: 900 });
  await pub.locator('[data-testid="journey-section"]').screenshot({ path: path.join(os.tmpdir(), "journey-desktop.png") });

  // a drafted journey is not public
  await admin.uncheck('[data-testid="journey-published"]');
  await admin.click('[data-testid="save-journey"]');
  await admin.waitForSelector('[data-testid="journey-saved"]');
  await pub.goto(`${BASE}/a/${SLUG}`);
  check("an unpublished journey disappears from the home page", (await pub.locator('[data-testid="journey-map"]').count()) === 0);
  // one-click "Add to home page" from the journeys list
  await admin.goto(`${BASE}/a/${SLUG}/admin/journeys`);
  check("list says it is not on the home page yet", (await admin.locator('[data-testid="journey-row"]').first().innerText()).includes("Not on your home page yet"));
  await admin.locator('[data-testid="toggle-home"]').first().click();
  await admin.waitForSelector('[data-testid="view-home"]');
  await pub.goto(`${BASE}/a/${SLUG}`);
  check("'Add to home page' puts the journey on the home page", (await pub.locator('[data-testid="journey-map"]').count()) === 1);
  await admin.locator('[data-testid="toggle-home"]').first().click();
  await admin.waitForSelector('[data-testid="toggle-home"]:has-text("Add to home page")');
  await pub.goto(`${BASE}/a/${SLUG}`);
  check("'Remove from home page' takes it off again", (await pub.locator('[data-testid="journey-map"]').count()) === 0);
  await admin.locator('[data-testid="toggle-home"]').first().click();
  await admin.waitForSelector('[data-testid="view-home"]');

  // ----- instructor: own journeys only, pictures -----
  const inst = await newPage();
  await login(inst, `instructor@${SLUG}.example`);
  await inst.goto(`${BASE}/a/${SLUG}/instructor/journeys`);
  check("instructor does not see the admin's journey", !(await inst.locator("body").innerText()).includes("Leadership pathways"));
  const res = await inst.goto(editorUrl.replace("/admin/", "/instructor/"));
  check("instructor cannot open the admin's journey by URL", res.status() === 404);
  const res2 = await inst.goto(editorUrl);
  check("instructor cannot use the admin journey area", res2.status() !== 200 || !(await inst.locator('[data-testid="journey-editor"]').count()));
  await inst.goto(`${BASE}/a/${SLUG}/instructor/journeys`);
  await inst.fill('[data-testid="new-journey-title"]', "Teaching careers");
  await Promise.all([inst.waitForURL(/\/instructor\/journeys\/[^/]+$/), inst.click('[data-testid="create-journey"]')]);
  await inst.waitForSelector('[data-testid="journey-editor"]');
  await inst.click('[data-testid="add-station"]');
  await inst.fill('[data-testid="station-title-0"]', "Mentoring");
  await inst.selectOption('[data-testid="station-kind-0"]', "ACTIVITY");
  await inst.fill('[data-testid="station-title-0"]', "Mentoring");
  await inst.click('[data-testid="add-line"]');
  await inst.fill('[data-testid="line-name-0"]', "Aspiring Head");
  await inst.selectOption('[data-testid="line-add-stop-0"]', { index: 1 });
  await inst.check('[data-testid="journey-published"]');
  await inst.click('[data-testid="save-journey"]');
  await inst.waitForSelector('[data-testid="journey-saved"]');
  check("instructor saved their own journey", true);
  await pub.goto(`${BASE}/a/${SLUG}`);
  check("home page now shows both journeys", (await pub.locator('[data-testid="journey-section"]').count()) === 2);

  // instructor course + module pictures
  const mine = await db.query(
    "SELECT c.id FROM courses c WHERE c.academy_id = (SELECT id FROM academies WHERE slug=$1) AND (c.created_by = (SELECT id FROM users WHERE email=$2) OR EXISTS (SELECT 1 FROM course_instructors ci WHERE ci.course_id=c.id AND ci.instructor_id=(SELECT id FROM users WHERE email=$2))) LIMIT 1",
    [SLUG, `instructor@${SLUG}.example`]
  );
  check("instructor owns a course", mine.rows.length === 1);
  await inst.goto(`${BASE}/a/${SLUG}/instructor/courses/${mine.rows[0].id}`);
  await inst.setInputFiles('[data-testid="cover-input"]', pngPath);
  await inst.locator('[data-testid="cover-input"]').locator("xpath=ancestor::form").locator('button[type="submit"]').click();
  await inst.waitForSelector("text=Saved.");
  const cover = await inst.request.get(`${BASE}/api/courses/${mine.rows[0].id}/cover`);
  check("instructor can upload a course picture", cover.status() === 200 && (cover.headers()["content-type"] || "").startsWith("image/"));
  await inst.goto(`${BASE}/a/${SLUG}/instructor/modules`);
  const imgInput = inst.locator('[data-testid="module-image-input"]').first();
  if (await imgInput.count()) {
    await imgInput.locator("xpath=ancestor::details[1]").evaluate((d) => (d.open = true));
    await imgInput.setInputFiles(pngPath);
    await imgInput.locator("xpath=ancestor::form").locator('button[type="submit"]').click();
    await inst.waitForTimeout(1500);
    const m = await db.query("SELECT id FROM modules WHERE image_path IS NOT NULL AND academy_id=(SELECT id FROM academies WHERE slug=$1) LIMIT 1", [SLUG]);
    check("instructor can upload a module picture", m.rows.length === 1);
  } else check("instructor modules page has a picture control", false);

  // admin sees both journeys in their list
  await admin.goto(`${BASE}/a/${SLUG}/admin/journeys`);
  const adminList = await admin.locator("body").innerText();
  check("admin sees every journey in the academy", adminList.includes("Leadership pathways") && adminList.includes("Teaching careers"));

  // cleanup
  await db.query("DELETE FROM learning_journeys WHERE academy_id = (SELECT id FROM academies WHERE slug=$1)", [SLUG]);
  await db.query("UPDATE academies SET language='en' WHERE slug=$1", [SLUG]);
} catch (e) {
  failures++;
  console.error("FAIL - unexpected error:", e);
} finally {
  await browser.close();
  await db.end();
  console.log(failures === 0 ? "\nAll journey/language e2e checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}
