// Browser end-to-end test for pass 35: the three course types (self-paced, certification,
// instructor-led), per-academy on/off switches for admins and instructors, the new course
// card (level • modules • hours), the picture-tile homepage, and the AI-picture buttons.
// Run against a started app on the seeded database:
//   TYPES_TEST_BASE_URL=http://localhost:3000 DATABASE_URL=postgres://… node scripts/course-types-e2e.mjs
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const pg = require("pg");

const BASE = process.env.TYPES_TEST_BASE_URL || "http://localhost:3000";
const SLUG = "brightwave";
const SHOTS = process.env.TYPES_TEST_SHOTS || "";
let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail ? " :: " + detail : ""}`);
}
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
async function newPage(w = 1280) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  return page;
}
async function login(page, email, slug = SLUG) {
  await page.goto(`${BASE}/a/${slug}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "Password123!");
  await Promise.all([page.waitForURL(/\/(admin|instructor|learner)/), page.click('button[type="submit"]')]);
}
async function toggleType(page, area, type) {
  await page.goto(`${BASE}/a/${SLUG}/${area}/courses`);
  await page.locator(`form[data-course-type="${type}"] button[type="submit"]`).click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
}
const typeState = async (page, area, type) => {
  await page.goto(`${BASE}/a/${SLUG}/${area}/courses`);
  return (await page.locator(`form[data-course-type="${type}"]`).innerText()).includes("Turn off");
};

try {
  const { rows: seeded } = await db.query("SELECT id, title, course_type, level, study_hours FROM courses WHERE academy_id = (SELECT id FROM academies WHERE slug = $1) ORDER BY title", [SLUG]);
  const cert = seeded.find((c) => c.course_type === "CERTIFICATION");
  const selfPaced = seeded.find((c) => c.course_type === "SELF_PACED");
  check("seed has a self-paced and a certification course", !!cert && !!selfPaced, seeded.map((c) => c.course_type).join(","));

  // ----- public home page: three-tile picture row + a section per type, new card -----
  const visitor = await newPage();
  await visitor.goto(`${BASE}/a/${SLUG}`);
  const homeText = await visitor.locator("body").innerText();
  check("home page is just headline, tagline and courses: no tiles, About or What you'll learn", (await visitor.locator('[data-testid="type-tile"]').count()) === 0 && !/About Brightwave/.test(homeText) && (await visitor.locator('[data-testid="what-youll-learn"]').count()) === 0);
  check("a section per type with courses", (await visitor.locator('[data-testid="type-section"]').count()) === 2);
  check("self-paced section uses the #self-paced anchor", (await visitor.locator("#self-paced").count()) === 1 && (await visitor.locator("#certification").count()) === 1);
  const metaTexts = await visitor.locator('[data-testid="course-meta"]').allInnerTexts();
  check("cards show level • modules • hours", metaTexts.length >= 2 && metaTexts.every((m) => /^(Beginner|Intermediate|Advanced) • \d+ modules? • [\d.]+ hr$/.test(m.trim())), metaTexts.join(" | "));
  const kickers = await visitor.locator('[data-testid="course-type-kicker"]').allInnerTexts();
  check("cards show their course type", kickers.some((k) => /Self-paced Training/i.test(k)) && kickers.some((k) => /Certification Pathways/i.test(k)), kickers.join(" | "));
  check("cards show a price pill (Free or £)", (await visitor.locator('[data-testid="course-price"]').allInnerTexts()).every((p) => /Free|£/.test(p)));
  if (SHOTS) await visitor.screenshot({ path: `${SHOTS}/home.png`, fullPage: true });

  // public course page
  await visitor.goto(`${BASE}/a/${SLUG}/courses/${cert.id}`);
  check("course page shows type, level, modules and hours", /Certification Pathways/i.test(await visitor.locator('[data-testid="course-type-kicker"]').innerText()) && /Intermediate|Advanced|Beginner/.test(await visitor.locator('[data-testid="course-meta"]').innerText()));
  if ((await visitor.locator('[data-testid="module-meta"]').count()) > 0) check("module rows show level and minutes", /min/.test(await visitor.locator('[data-testid="module-meta"]').first().innerText()));
  if (SHOTS) await visitor.screenshot({ path: `${SHOTS}/course.png`, fullPage: true });

  // ----- admin: switches, create a course of each remaining type -----
  const admin = await newPage();
  await login(admin, "admin@brightwave.example");
  await admin.goto(`${BASE}/a/${SLUG}/admin/courses`);
  check("admin sees the three on/off switches", (await admin.locator("form[data-course-type]").count()) === 3);
  if (SHOTS) await admin.screenshot({ path: `${SHOTS}/admin-courses.png`, fullPage: true });
  check("instructor-led starts switched on", await typeState(admin, "admin", "INSTRUCTOR_LED"));

  await admin.goto(`${BASE}/a/${SLUG}/admin/courses?type=INSTRUCTOR_LED#new-course`);
  check("?type= pre-selects the type in the create form", (await admin.locator('[data-testid="new-course-type"]').inputValue()) === "INSTRUCTOR_LED");
  await admin.fill('input[name="title"]', "Live Workshop E2E");
  await admin.fill('textarea[name="description"]', "A live workshop with an instructor.");
  await admin.selectOption('[data-testid="new-course-level"]', "ADVANCED");
  await admin.fill('input[name="study_hours"]', "8");
  await Promise.all([admin.waitForURL(/\/admin\/courses\/[0-9a-f-]{36}/), admin.click('button:has-text("Create Course")')]);
  const newId = admin.url().split("/").pop();
  const { rows: [row] } = await db.query("SELECT course_type, level, study_hours FROM courses WHERE id = $1", [newId]);
  check("new course saved with type, level and hours", row.course_type === "INSTRUCTOR_LED" && row.level === "ADVANCED" && row.study_hours === 8, JSON.stringify(row));
  check("edit form shows the saved type/level/hours", (await admin.locator('[data-testid="course-type-select"]').inputValue()) === "INSTRUCTOR_LED" && (await admin.locator('[data-testid="course-hours-input"]').inputValue()) === "8");

  // edit: change level/hours and publish
  await admin.selectOption('[data-testid="course-level-select"]', "INTERMEDIATE");
  await admin.fill('[data-testid="course-hours-input"]', "7.5");
  await admin.check('input[name="is_published"]');
  await admin.click('button:has-text("Save Changes")');
  await admin.waitForLoadState("networkidle");
  await admin.waitForTimeout(500);
  const { rows: [row2] } = await db.query("SELECT level, study_hours, is_published FROM courses WHERE id = $1", [newId]);
  check("editing level/hours/publish saves", row2.level === "INTERMEDIATE" && row2.study_hours === 7.5 && row2.is_published === 1, JSON.stringify(row2));

  // AI picture button explains itself when AI isn't configured
  const aiBtn = admin.locator('[data-testid="course-ai-picture"]');
  check("course page has a 'Design a picture with AI' button", (await aiBtn.count()) === 1);
  await aiBtn.click();
  await admin.waitForTimeout(1200);
  const adminText = await admin.locator("body").innerText();
  check("without an API key the AI picture button says so (no crash)", /aren't set up yet|New picture saved/.test(adminText));

  await visitor.goto(`${BASE}/a/${SLUG}`);
  check("home page now has three course sections", (await visitor.locator('[data-testid="type-section"]').count()) === 3);
  const wm = await visitor.locator(`[data-testid="course-card"]:has-text("Live Workshop E2E") [data-testid="course-meta"]`).innerText();
  check("new card meta reads Intermediate • 0 modules • 7.5 hr", wm.trim() === "Intermediate • 0 modules • 7.5 hr", wm);

  // ----- switching a type off hides it everywhere (admin) -----
  await toggleType(admin, "admin", "CERTIFICATION");
  check("switch shows Off after turning certification off", !(await typeState(admin, "admin", "CERTIFICATION")));
  await visitor.goto(`${BASE}/a/${SLUG}`);
  check("home page hides the certification section", (await visitor.locator('[data-testid="type-section"][data-course-type="CERTIFICATION"]').count()) === 0);
  const resp = await visitor.goto(`${BASE}/a/${SLUG}/courses/${cert.id}`);
  check("its public course page is gone (404)", resp?.status() === 404, String(resp?.status()));

  // learner: catalogue hides it, can't enrol
  const learner = await newPage();
  await login(learner, "learner@brightwave.example");
  await learner.goto(`${BASE}/a/${SLUG}/learner/catalog`);
  const sections = await learner.locator('[data-testid="catalog-section"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-course-type")));
  check("learner catalogue hides the switched-off type", !sections.includes("CERTIFICATION") && sections.includes("SELF_PACED"), sections.join(","));
  const r2 = await learner.goto(`${BASE}/a/${SLUG}/learner/enrol/${cert.id}`);
  check("enrolment page for a switched-off type is 404", r2?.status() === 404, String(r2?.status()));
  if (SHOTS) {
    await learner.goto(`${BASE}/a/${SLUG}/learner/catalog`);
    await learner.screenshot({ path: `${SHOTS}/catalog.png`, fullPage: true });
  }

  // ----- instructor can switch it back on -----
  const instructor = await newPage();
  await login(instructor, "instructor@brightwave.example");
  await instructor.goto(`${BASE}/a/${SLUG}/instructor/courses`);
  check("instructor sees the switches too", (await instructor.locator("form[data-course-type]").count()) === 3);
  await toggleType(instructor, "instructor", "CERTIFICATION");
  check("instructor turned certification back on", await typeState(instructor, "instructor", "CERTIFICATION"));
  const r3 = await visitor.goto(`${BASE}/a/${SLUG}/courses/${cert.id}`);
  check("certification course is public again", r3?.status() === 200, String(r3?.status()));

  // all types off -> graceful empty homepage
  for (const ty of ["SELF_PACED", "CERTIFICATION", "INSTRUCTOR_LED"]) await toggleType(admin, "admin", ty);
  await visitor.goto(`${BASE}/a/${SLUG}`);
  check("with every type off the home page still loads, with no course sections", (await visitor.locator('[data-testid="type-section"]').count()) === 0 && /Courses will appear here/.test(await visitor.locator("body").innerText()));
  for (const ty of ["SELF_PACED", "CERTIFICATION", "INSTRUCTOR_LED"]) await toggleType(admin, "admin", ty);
  check("…and everything back on", (await visitor.goto(`${BASE}/a/${SLUG}`), (await visitor.locator('[data-testid="type-section"]').count()) === 3));

  // other academy unaffected
  const other = await newPage();
  await login(other, "admin@riverside.example", "riverside");
  await other.goto(`${BASE}/a/riverside/admin/site`); // the admin's preview of the (unpublished) page
  check("another academy's sections are unaffected", (await other.locator('[data-testid="type-section"]').count()) >= 1);

  // narrow screen: tiles stack
  const phone = await newPage(390);
  await phone.goto(`${BASE}/a/${SLUG}`);
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("phone width: no sideways scrolling", overflow <= 1, String(overflow));
  if (SHOTS) await phone.screenshot({ path: `${SHOTS}/phone.png`, fullPage: true });

  // module study minutes (library)
  await admin.goto(`${BASE}/a/${SLUG}/admin/modules`);
  check("module library has the study-time field and AI picture button", (await admin.locator('input[name="study_minutes"]').count()) > 0 && (await admin.locator('[data-testid="module-ai-picture"]').count()) > 0);

  // cleanup
  await db.query("DELETE FROM course_modules WHERE course_id = $1", [newId]);
  await db.query("DELETE FROM courses WHERE id = $1", [newId]);
} catch (err) {
  failures++;
  console.error("FAIL - unexpected error:", err);
} finally {
  await browser.close();
  await db.end();
}
console.log(failures ? `${failures} check(s) FAILED.` : "All checks passed.");
process.exit(failures ? 1 : 0);
