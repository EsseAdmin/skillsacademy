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
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import JSZip from "jszip";

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

// When lib/email.ts has no RESEND_API_KEY, it logs the "would have sent"
// email to the server's own console (fine for a human watching it) and also
// drops the most recent one as JSON in the OS temp dir specifically so a
// separate process like this test script can read the real reset/set-
// password link instead of skipping that coverage. See lib/email.ts.
const EMAIL_DEBUG_PATH = path.join(os.tmpdir(), "skillsacademy-last-email.json");

function readLastEmailDebug() {
  try {
    return JSON.parse(fs.readFileSync(EMAIL_DEBUG_PATH, "utf8"));
  } catch {
    return null;
  }
}

// Polls the debug file for an email to `recipient` sent at or after
// `sinceMs`, so this doesn't race the server action that's still writing it
// and doesn't accidentally pick up a stale file left over from an earlier
// run or an earlier step in this same run.
async function waitForEmailTo(recipient, sinceMs, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const email = readLastEmailDebug();
    if (email && email.to === recipient && new Date(email.sentAt).getTime() >= sinceMs) {
      return email;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

function extractResetToken(emailText) {
  const m = emailText && emailText.match(/token=([a-f0-9]{64})/);
  return m ? m[1] : null;
}

async function buildTestScormZip() {
  const manifest = `<?xml version="1.0" standalone="no" ?>
<manifest identifier="SmokeTestCourse" version="1" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="SmokeTestOrg">
    <organization identifier="SmokeTestOrg">
      <title>Smoke Test Course</title>
      <item identifier="Item1" identifierref="Resource1"><title>Lesson 1</title></item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="Resource1" type="webcontent" adlcp:scormtype="sco" href="index.html" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
      <file href="index.html" />
    </resource>
  </resources>
</manifest>`;
  const indexHtml = `<!DOCTYPE html><html><body><h1>Smoke Test SCO</h1>
<script>
function findAPI(win) { let tries = 0; while (win.API == null && win.parent != null && win.parent !== win && tries < 10) { win = win.parent; tries++; } return win.API; }
var api = findAPI(window);
if (api) { api.LMSInitialize(""); api.LMSSetValue("cmi.core.lesson_status", "completed"); api.LMSCommit(""); }
</script></body></html>`;

  const zip = new JSZip();
  zip.file("imsmanifest.xml", manifest);
  zip.file("index.html", indexHtml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  const tmpPath = path.join(os.tmpdir(), `smoke-test-scorm-${Date.now()}.zip`);
  fs.writeFileSync(tmpPath, buffer);
  return tmpPath;
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

  // 6. Super admin login + dashboard. The super admin account itself is
  // unchanged (still superadmin@skillsacademy.ai / SuperAdmin123! — same
  // credentials used to log in below), but the login page no longer
  // prints them on-screen for anyone who lands there to see.
  await withPage(browser, async (page) => {
    const loginResp = await page.goto(`${BASE}/super-admin/login`, { waitUntil: "networkidle" });
    const loginPageText = await page.textContent("body");
    log("Super admin login page loads", loginResp.ok(), `status ${loginResp.status()}`);
    log("Super admin login page no longer shows the credentials on-screen", !/SuperAdmin123|superadmin@skillsacademy\.ai/i.test(loginPageText));
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
    // Discover the file module's download link from the learner's enrolled
    // courses rather than hardcoding a module id — ids are freshly generated
    // UUIDs on every reseed, so a hardcoded id goes stale the moment the DB
    // resets. The learner may now be enrolled in several courses (this
    // script itself enrolls them in extra ones further down for the quiz/
    // SCORM checks), so search every enrolled course rather than assuming
    // the first one in the list has a FILE-type module.
    await page.goto(`${BASE}/a/brightwave/learner`, { waitUntil: "networkidle" });
    const courseHrefs = await page.locator('a[href*="/learner/courses/"]').evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    let fileHref;
    for (const href of [...new Set(courseHrefs)]) {
      await page.goto(`${BASE}${href}`, { waitUntil: "networkidle" });
      // Use count() before getAttribute() so a course with no file-module
      // link resolves immediately instead of burning Playwright's default
      // ~30s actionability wait on a locator that will never appear. With
      // this suite re-run repeatedly against the same dev DB (and each run
      // enrolling the learner in a few more courses for later checks), the
      // learner's enrollment count only grows over time — the naive
      // `.first().getAttribute()` here used to make this loop take
      // several minutes once there were a couple dozen enrollments.
      const fileLink = page.locator('a[href^="/api/files/"]').first();
      const href2 = (await fileLink.count()) > 0 ? await fileLink.getAttribute("href") : null;
      if (href2) {
        fileHref = href2;
        break;
      }
    }
    log("Found a file-module download link on the course page", !!fileHref, fileHref || "<none>");
    if (!fileHref) return;
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

  // 10. Live session module: admins/instructors now paste their own Zoom or
  // Microsoft Teams meeting link (no OAuth connection) — create one and
  // confirm it round-trips through Postgres and renders on the modules
  // list. Also confirm the old OAuth-connect page is gone (404), not just
  // redirected by auth middleware — request it while logged in.
  await withPage(browser, async (page) => {
    await loginAs(page, "brightwave", "admin@brightwave.example", "Password123!");

    const resp = await page.goto(`${BASE}/a/brightwave/admin/integrations`, { waitUntil: "networkidle" });
    log("Old Zoom/Teams OAuth-connect page no longer exists", resp.status() === 404, `status ${resp.status()}`);

    await page.goto(`${BASE}/a/brightwave/admin/modules`, { waitUntil: "networkidle" });
    const uniqueTitle = `Smoke Test Live Session ${Date.now()}`;
    await page.fill('input[name="title"]', uniqueTitle);
    await page.click('button:has-text("🎥 Live Session")');
    await page.click('button:has-text("🔵 Zoom")');
    await page.fill('input[name="live_join_url"]', "https://zoom.us/j/1234567890");
    await page.fill('input[name="live_password"]', "abc123");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }),
      page.click('form:has(input[name="live_join_url"]) button[type="submit"]'),
    ]);

    const text = await page.textContent("body");
    log("Manually-linked live session module appears in the library", text.includes(uniqueTitle));
    log("Live session shows provider (zoom)", text.toLowerCase().includes("zoom"));
  }, "Live session manual link");

  // 10a. Amending module content: admins/instructors can edit a module's
  // content after creation (title, description, and type-specific content)
  // — previously only create/delete existed. Create a TEXT module, edit its
  // text via the "Edit content" panel, and confirm the change persists.
  await withPage(browser, async (page) => {
    await loginAs(page, "brightwave", "admin@brightwave.example", "Password123!");
    await page.goto(`${BASE}/a/brightwave/admin/modules`, { waitUntil: "networkidle" });

    const uniqueTitle = `Smoke Test Editable Module ${Date.now()}`;
    await page.fill('input[name="title"]', uniqueTitle);
    await page.fill('textarea[name="content_text"]', "Original content before edit.");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }),
      page.click('form:has(textarea[name="content_text"]) button[type="submit"]'),
    ]);

    const card = page.locator(".app-card", { hasText: uniqueTitle }).last();
    log("New module card is visible before editing", (await card.count()) > 0);
    await card.locator("summary", { hasText: "Edit content" }).click();

    const updatedTitle = `${uniqueTitle} (edited)`;
    const editForm = card.locator('form:has(textarea[name="content_text"])');
    await editForm.locator('input[name="title"]').fill(updatedTitle);
    await editForm.locator('textarea[name="content_text"]').fill("Updated content after edit.");
    await editForm.locator('button[type="submit"]').click();
    await page.waitForTimeout(500);
    await page.goto(`${BASE}/a/brightwave/admin/modules`, { waitUntil: "networkidle" });

    const text = await page.textContent("body");
    log("Edited module title is reflected on the modules page", text.includes(updatedTitle));
    log("Edited module content is reflected on the modules page", text.includes("Updated content after edit."));
    log("Original (pre-edit) content no longer shown", !text.includes("Original content before edit."));
  }, "Amend module content");

  // 10b. Custom academy templates: an admin can build their own colour/font
  // template on the Branding page, it applies immediately, it's scoped to
  // that academy only (doesn't leak to other academies), and it can be
  // deleted once no longer active.
  await withPage(browser, async (page) => {
    await loginAs(page, "riverside", "admin@riverside.example", "Password123!");
    await page.goto(`${BASE}/a/riverside/admin/branding`, { waitUntil: "networkidle" });

    const uniqueName = `Smoke Test Template ${Date.now()}`;
    await page.fill('input[name="name"]', uniqueName);
    await page.fill('input[name="description"]', "Created by the smoke test");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }),
      page.click('form:has(input[name="name"]) button[type="submit"]'),
    ]);

    let text = await page.textContent("body");
    log("Custom template appears on Branding page", text.includes(uniqueName));
    log("Custom template is marked active immediately", /Active/.test(text) && text.includes(uniqueName));

    // Scoping: this custom template must not appear for a different academy.
    await loginAs(page, "brightwave", "admin@brightwave.example", "Password123!");
    await page.goto(`${BASE}/a/brightwave/admin/branding`, { waitUntil: "networkidle" });
    const brightwaveText = await page.textContent("body");
    log("Custom template does not leak to a different academy", !brightwaveText.includes(uniqueName));

    // Switch riverside back to a preset, then delete the custom template.
    // These are two separate server-action submissions — reload fresh
    // between them rather than chaining waitForNavigation, since the delete
    // button's visibility depends on the *committed* active-template state
    // (t.id !== template.id), and clicking too early can hit a stale node.
    await loginAs(page, "riverside", "admin@riverside.example", "Password123!");
    await page.goto(`${BASE}/a/riverside/admin/branding`, { waitUntil: "networkidle" });
    await page.click('input[name="template"][value="navy-gold"] ~ button[type="submit"]');
    await page.waitForTimeout(500);
    await page.goto(`${BASE}/a/riverside/admin/branding`, { waitUntil: "networkidle" });

    const switchedText = await page.textContent("body");
    log("Switched back to preset before deleting custom template", switchedText.includes(uniqueName) && /Active/.test(switchedText));

    await page.click(`form:has(input[name="templateId"]) button:has-text("Delete")`);
    await page.waitForTimeout(500);
    await page.goto(`${BASE}/a/riverside/admin/branding`, { waitUntil: "networkidle" });
    text = await page.textContent("body");
    log("Custom template removed after delete", !text.includes(uniqueName));
  }, "Custom academy templates");

  // 11. SEO & Marketing tier gating — riverside is on the Starter plan, so
  // Growth/Enterprise panels should show an upgrade notice instead of
  // controls; northgate is on Enterprise, so nothing should be locked.
  await withPage(browser, async (page) => {
    await loginAs(page, "riverside", "admin@riverside.example", "Password123!");
    const resp = await page.goto(`${BASE}/a/riverside/admin/marketing`, { waitUntil: "networkidle" });
    log("Marketing page loads (Starter plan)", resp.ok(), `status ${resp.status()}`);
    // Count visible DOM nodes rather than raw HTML/textContent — the page
    // also embeds a serialized RSC payload in a <script> tag for hydration,
    // which repeats every server-rendered string and would double-count a
    // naive substring search.
    const upgradeCount = await page.locator('div:text-is("Available on the Growth plan and above. Upgrade from Billing to unlock this.")')
      .or(page.locator('div:text-is("Available on the Enterprise plan and above. Upgrade from Billing to unlock this.")'))
      .count();
    log("Starter plan shows upgrade prompts for Growth + Enterprise sections", upgradeCount === 2, `found ${upgradeCount}`);
  }, "Marketing tier gating (Starter)");

  await withPage(browser, async (page) => {
    await loginAs(page, "northgate", "admin@northgate.example", "Password123!");
    const resp = await page.goto(`${BASE}/a/northgate/admin/marketing`, { waitUntil: "networkidle" });
    log("Marketing page loads (Enterprise plan)", resp.ok(), `status ${resp.status()}`);
    const text = await page.textContent("body");
    log("Enterprise plan has no locked sections", !text.includes("Upgrade from Billing"));
  }, "Marketing tier gating (Enterprise)");

  // 12. Full quiz → certification lifecycle: create a free course with a
  // single quiz module, enable certification, have the seeded learner pass
  // the quiz, then confirm a certificate was auto-issued and its public
  // verification page validates it.
  let quizCourseId;
  await withPage(browser, async (page) => {
    await loginAs(page, "brightwave", "admin@brightwave.example", "Password123!");

    await page.goto(`${BASE}/a/brightwave/admin/courses`, { waitUntil: "networkidle" });
    await page.fill('input[name="title"]', `Smoke Quiz Course ${Date.now()}`);
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle" }), page.click('button:has-text("Create Course")')]);
    const courseMatch = page.url().match(/\/courses\/([a-f0-9-]{36})/);
    quizCourseId = courseMatch && courseMatch[1];
    log("New course created for quiz test", !!quizCourseId, page.url());

    // Enable certification on the course.
    const checkbox = page.locator('input[name="certification_enabled"]');
    if (!(await checkbox.isChecked())) await checkbox.check();
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle" }), page.click('button:has-text("Save Changes")')]);

    // Build the quiz.
    await page.goto(`${BASE}/a/brightwave/admin/quizzes/new?courseId=${quizCourseId}`, { waitUntil: "networkidle" });
    await page.fill('input[name="title"]', "Smoke Test Quiz");
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle" }), page.click('button:has-text("Create Quiz")')]);
    const moduleMatch = page.url().match(/\/quizzes\/([a-f0-9-]{36})/);
    const quizModuleId = moduleMatch && moduleMatch[1];
    log("Quiz module created and assigned to course", !!quizModuleId, page.url());

    // Add a single-choice question with a known correct answer.
    await page.fill('input[name="prompt"]', "What is 2 + 2?");
    const optionInputs = page.locator('input[name="option_text"]');
    await optionInputs.nth(0).fill("4");
    await optionInputs.nth(1).fill("5");
    await page.locator('input[name="option_correct"]').nth(0).check();
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle" }), page.click('button:has-text("Add Question")')]);
    const questionsListed = (await page.textContent("body")).includes("What is 2 + 2?");
    log("Question added to quiz", questionsListed);

    // Enrol the seeded learner directly.
    await page.goto(`${BASE}/a/brightwave/admin/courses/${quizCourseId}`, { waitUntil: "networkidle" });
    const learnerSelect = page.locator('select[name="learnerId"]');
    if (await learnerSelect.count()) {
      await learnerSelect.selectOption({ label: "Brightwave Learner" });
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle" }).catch(() => {}),
        page.click('button:has-text("Enrol")'),
      ]);
    }
  }, "Quiz + certification setup");

  let issuedCertNumber;
  await withPage(browser, async (page) => {
    if (!quizCourseId) {
      log("Learner passes quiz and earns certificate", false, "quiz course wasn't created — skipping");
      return;
    }
    await loginAs(page, "brightwave", "learner@brightwave.example", "Password123!");
    await page.goto(`${BASE}/a/brightwave/learner/courses/${quizCourseId}`, { waitUntil: "networkidle" });
    const quizLink = await page.locator('a[href*="/learner/quiz/"]').first().getAttribute("href");
    log("Learner sees the quiz module on the course page", !!quizLink, quizLink || "<none>");
    if (!quizLink) return;

    await page.goto(`${BASE}${quizLink}`, { waitUntil: "networkidle" });
    // The known-correct option ("4") was added first, so it's the first radio.
    await page.locator('input[type="radio"]').first().check();
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle" }), page.click('button:has-text("Submit Quiz")')]);
    const resultText = await page.textContent("body");
    log("Quiz submission reports a pass", resultText.includes("Passed"));

    await page.goto(`${BASE}/a/brightwave/learner/certificates`, { waitUntil: "networkidle" });
    const certText = await page.textContent("body");
    log("Certificate appears on My Certificates page", certText.includes("Smoke Quiz Course") || certText.includes("No."));
    const certLink = await page.locator('a[href^="/certificates/"]').first().getAttribute("href");
    issuedCertNumber = certLink ? certLink.split("/").pop() : undefined;
    log("Certificate verification link found", !!issuedCertNumber, certLink || "<none>");
  }, "Quiz pass + certificate issuance");

  await withPage(browser, async (page) => {
    if (!issuedCertNumber) {
      log("Certificate verification page validates the certificate", false, "no certificate number captured — skipping");
      return;
    }
    const resp = await page.goto(`${BASE}/certificates/${issuedCertNumber}`, { waitUntil: "networkidle" });
    log("Certificate verification page loads", resp.ok(), `status ${resp.status()}`);
    const text = await page.textContent("body");
    log("Certificate verification page confirms validity", text.includes("Certificate verified"));
  }, "Certificate verification page");

  await withPage(browser, async (page) => {
    const resp = await page.goto(`${BASE}/certificates/NOT-A-REAL-NUMBER`, { waitUntil: "networkidle" });
    log("Certificate verification page loads for an unknown number", resp.ok(), `status ${resp.status()}`);
    const text = await page.textContent("body");
    log("Unknown certificate number reports not found", text.includes("not found") || text.includes("Certificate not found"));
  }, "Certificate verification page (unknown number)");

  // 13. SCORM package upload + in-browser playback.
  let scormCourseId;
  await withPage(browser, async (page) => {
    await loginAs(page, "brightwave", "admin@brightwave.example", "Password123!");

    await page.goto(`${BASE}/a/brightwave/admin/courses`, { waitUntil: "networkidle" });
    await page.fill('input[name="title"]', `Smoke SCORM Course ${Date.now()}`);
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle" }), page.click('button:has-text("Create Course")')]);
    const courseMatch = page.url().match(/\/courses\/([a-f0-9-]{36})/);
    scormCourseId = courseMatch && courseMatch[1];
    log("New course created for SCORM test", !!scormCourseId);
    if (!scormCourseId) return;

    const zipPath = await buildTestScormZip();
    await page.goto(`${BASE}/a/brightwave/admin/scorm/new?courseId=${scormCourseId}`, { waitUntil: "networkidle" });
    await page.fill('input[name="title"]', "Smoke Test SCORM Module");
    await page.setInputFiles('input[name="file"]', zipPath);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }),
      page.click('button:has-text("Upload & Process")'),
    ]);
    const afterUploadText = await page.textContent("body");
    log("SCORM package uploaded and parsed without error", !afterUploadText.includes("Error") && page.url().includes("/modules"));

    // Enrol the learner so the playback check below has course access.
    await page.goto(`${BASE}/a/brightwave/admin/courses/${scormCourseId}`, { waitUntil: "networkidle" });
    const learnerSelect = page.locator('select[name="learnerId"]');
    if (await learnerSelect.count()) {
      await learnerSelect.selectOption({ label: "Brightwave Learner" });
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle" }).catch(() => {}),
        page.click('button:has-text("Enrol")'),
      ]);
    }
  }, "SCORM upload");

  await withPage(browser, async (page) => {
    if (!scormCourseId) {
      log("Learner can launch SCORM content in-browser", false, "SCORM course wasn't created — skipping");
      return;
    }
    await loginAs(page, "brightwave", "learner@brightwave.example", "Password123!");
    await page.goto(`${BASE}/a/brightwave/learner/courses/${scormCourseId}`, { waitUntil: "networkidle" });
    const scormLink = await page.locator('a[href*="/learner/scorm/"]').first().getAttribute("href");
    log("Learner sees the SCORM module on the course page", !!scormLink, scormLink || "<none>");
    if (!scormLink) return;

    await page.goto(`${BASE}${scormLink}`, { waitUntil: "networkidle" });
    const iframeSrc = await page.locator("iframe").first().getAttribute("src");
    log("SCORM player renders an iframe pointed at the package content", !!iframeSrc, iframeSrc || "<none>");
    if (!iframeSrc) return;

    // Fetch the iframe's target directly via the API request context (shares
    // the logged-in session's cookies) rather than page.goto(), which would
    // navigate the top-level page away and tear down the window.API shim
    // the SCORM content's own script needs to find on window.parent.
    const apiResp = await page.request.get(`${BASE}${iframeSrc}`);
    const bodyText = await apiResp.text();
    log("SCORM launch file serves the real package content", apiResp.ok() && bodyText.includes("Smoke Test SCO"), `status ${apiResp.status()}`);

    // Meanwhile, the iframe still loaded normally in the player page above —
    // its own script already ran findAPI() + LMSSetValue/LMSCommit against
    // the shim attached to this page's window. Give the resulting fetch()
    // to the attempts API a moment to complete server-side.
    await page.waitForTimeout(1500);
  }, "SCORM in-browser playback");

  await withPage(browser, async (page) => {
    if (!scormCourseId) return;
    await loginAs(page, "brightwave", "learner@brightwave.example", "Password123!");
    // The previous section's completion fetch (triggered by the SCORM
    // shim's own script inside the iframe) is fire-and-forget from this
    // fresh page/context's point of view, and how long it takes to land
    // server-side isn't fully predictable under shared-machine load — so
    // poll a few times rather than trust a single fixed-delay snapshot.
    let text = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      await page.goto(`${BASE}/a/brightwave/learner/courses/${scormCourseId}`, { waitUntil: "networkidle" });
      text = await page.textContent("body");
      if (text.includes("✓ Complete")) break;
      await page.waitForTimeout(1000);
    }
    log("SCORM module shows complete after the shim reports lesson_status=completed", text.includes("✓ Complete"));
  }, "SCORM completion sync");

  // 14. Auto-generated sitemap (Starter-tier SEO feature, available on every plan).
  await withPage(browser, async (page) => {
    const resp = await page.goto(`${BASE}/a/brightwave/sitemap.xml`, { waitUntil: "networkidle" });
    log("Academy sitemap.xml loads", resp.ok(), `status ${resp.status()}`);
    const text = await page.textContent("body");
    log("Sitemap includes the academy homepage URL", text.includes("/a/brightwave<"));
  }, "Sitemap");

  // 15. Super admin: deleting an academy now removes it from the main
  // Academies list entirely (it used to stay visible, greyed out, with a
  // "DELETED" tag and a Restore button inline) — it should only show up in
  // the separate collapsed "Deleted academies" section, still restorable
  // from there. Uses the seeded "northgate" academy since it isn't needed
  // by any later section, and restores it immediately afterwards (in a
  // finally block) so a failed assertion can't leave it deleted for future
  // runs.
  await withPage(browser, async (page) => {
    await page.goto(`${BASE}/super-admin/login`, { waitUntil: "networkidle" });
    await page.fill('input[name="email"]', "superadmin@skillsacademy.ai");
    await page.fill('input[name="password"]', "SuperAdmin123!");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }),
      page.click('button[type="submit"]'),
    ]);

    try {
      await page.goto(`${BASE}/super-admin/academies`, { waitUntil: "networkidle" });
      const beforeText = await page.textContent("body");
      log("Northgate appears in the main list before deletion", beforeText.includes("Northgate") || beforeText.includes("northgate"));

      const card = page.locator(".app-card", { hasText: /northgate/i });
      await card.locator('button:has-text("Delete Academy")').click();
      await page.waitForTimeout(500);
      await page.goto(`${BASE}/super-admin/academies`, { waitUntil: "networkidle" });

      const afterMainList = (await page.textContent("body")).split("Deleted academies")[0];
      log("Deleted academy no longer appears in the main list", !/northgate/i.test(afterMainList));

      const fullText = await page.textContent("body");
      log("Deleted academy still appears under Deleted academies (restorable)", /northgate/i.test(fullText) && fullText.includes("DELETED"));
    } finally {
      // Always restore, even if an assertion above failed, so future runs
      // (and any other suite relying on the seeded academies) aren't broken.
      await page.goto(`${BASE}/super-admin/academies`, { waitUntil: "networkidle" });
      const details = page.locator("details", { hasText: "Deleted academies" });
      if (await details.count()) {
        await details.locator("summary").click();
        const restoreButton = details.locator(".app-card", { hasText: /northgate/i }).locator('button:has-text("Restore Academy")');
        if (await restoreButton.count()) {
          await restoreButton.click();
          await page.waitForTimeout(500);
        }
      }
    }

    await page.goto(`${BASE}/super-admin/academies`, { waitUntil: "networkidle" });
    const restoredText = await page.textContent("body");
    const restoredMainList = restoredText.split("Deleted academies")[0];
    log("Northgate is restored to the main list after the test", /northgate/i.test(restoredMainList));
  }, "Super admin academy deletion");

  // 16. Signup pricing cards: the Starter/Enterprise cards (plain white
  // background) must show the price and feature text in a visibly dark
  // colour, not just have it present in the DOM — this was a CSS
  // regression where .tier-price/.tier-features had no colour rule outside
  // the "featured" (dark) card, so the text rendered white-on-white and was
  // invisible even though the markup and data were both correct.
  await withPage(browser, async (page) => {
    await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
    await page.fill('input[placeholder="e.g. Brightwave Consulting"]', `Smoke Test Org ${Date.now()}`);
    await page.click('button:has-text("Continue")');
    await page.click('button:has-text("Continue")');

    const cards = page.locator(".tier-card");
    const count = await cards.count();
    log("Three plan cards render on the pricing step", count === 3, `found ${count}`);

    const starterPriceText = await cards.nth(0).locator(".tier-price").innerText();
    log("Starter plan price shows an actual amount", /£/.test(starterPriceText), starterPriceText);

    const starterPriceColor = await cards.nth(0).locator(".tier-price").evaluate((el) => getComputedStyle(el).color);
    const enterprisePriceColor = await cards.nth(2).locator(".tier-price").evaluate((el) => getComputedStyle(el).color);
    log("Starter plan price is a visible dark colour, not invisible white", starterPriceColor !== "rgb(255, 255, 255)", starterPriceColor);
    log("Enterprise plan price is a visible dark colour, not invisible white", enterprisePriceColor !== "rgb(255, 255, 255)", enterprisePriceColor);

    const starterFeatureColor = await cards.nth(0).locator(".tier-features li").first().evaluate((el) => getComputedStyle(el).color);
    log("Starter plan feature text is a visible dark colour, not invisible white", starterFeatureColor !== "rgb(255, 255, 255)", starterFeatureColor);
  }, "Signup pricing card contrast");

  // 17. Academy homepage customization: an admin can add text/news content
  // blocks to their live public homepage, reorder them, hide/show them, and
  // see the result on both the admin preview and the actual public page.
  await withPage(browser, async (page) => {
    await loginAs(page, "brightwave", "admin@brightwave.example", "Password123!");
    await page.goto(`${BASE}/a/brightwave/admin/site`, { waitUntil: "networkidle" });

    const stamp = Date.now();
    const textTitle = `Smoke Test Text Block ${stamp}`;
    const newsTitle = `Smoke Test News Block ${stamp}`;

    // Add a TEXT block (default selected type in the "Add a section" form).
    const addForm = page.locator("#new-site-block-form");
    await addForm.locator('input[name="title"]').fill(textTitle);
    await addForm.locator('textarea[name="body_text"]').fill("Original text block content.");
    await addForm.locator('button[type="submit"]').click();
    await page.waitForTimeout(500);
    await page.goto(`${BASE}/a/brightwave/admin/site`, { waitUntil: "networkidle" });

    let text = await page.textContent("body");
    log("New TEXT block appears in the admin content list", text.includes(textTitle));
    log("New TEXT block appears in the admin preview", (text.match(new RegExp(textTitle, "g")) || []).length >= 2);

    // Add a NEWS block.
    const addForm2 = page.locator("#new-site-block-form");
    await addForm2.locator('button:has-text("📰 News / announcement")').click();
    await addForm2.locator('input[name="title"]').fill(newsTitle);
    await addForm2.locator('textarea[name="body_text"]').fill("Big news for our learners.");
    await addForm2.locator('button[type="submit"]').click();
    await page.waitForTimeout(500);
    await page.goto(`${BASE}/a/brightwave/admin/site`, { waitUntil: "networkidle" });

    text = await page.textContent("body");
    log("New NEWS block appears in the admin content list", text.includes(newsTitle));

    // Reorder: the NEWS block was added second, so it should currently sort
    // after the TEXT block — move it up and confirm it now sorts first.
    const newsCard = page.locator(".border-gray-200.rounded-lg", { hasText: newsTitle });
    await newsCard.locator('button[title="Move up"]').click();
    await page.waitForTimeout(500);
    await page.goto(`${BASE}/a/brightwave/admin/site`, { waitUntil: "networkidle" });
    text = await page.textContent("body");
    log("Moving a block up changes its position before the other block", text.indexOf(newsTitle) < text.indexOf(textTitle));

    // Hide the TEXT block and confirm it disappears from the live public
    // page (brightwave is already published from earlier smoke-test
    // sections) while still showing (dimmed) in the admin preview.
    const textCard = page.locator(".border-gray-200.rounded-lg", { hasText: textTitle });
    await textCard.locator('button:has-text("Hide")').click();
    await page.waitForTimeout(500);

    const publicResp = await page.goto(`${BASE}/a/brightwave`, { waitUntil: "networkidle" });
    const publicText = await page.textContent("body");
    log("Public academy page loads with the hidden block in place", publicResp.ok());
    log("Hidden TEXT block does not appear on the live public page", !publicText.includes(textTitle));
    log("Visible NEWS block does appear on the live public page", publicText.includes(newsTitle));

    await page.goto(`${BASE}/a/brightwave/admin/site`, { waitUntil: "networkidle" });
    text = await page.textContent("body");
    log("Hidden TEXT block still shown (marked Hidden) in the admin preview", text.includes(textTitle) && text.includes("Hidden"));

    // Clean up: delete both smoke-test blocks so repeated runs don't pile
    // up content on the shared brightwave academy.
    await page.locator(".border-gray-200.rounded-lg", { hasText: textTitle }).locator('button:has-text("Delete")').click();
    await page.waitForTimeout(300);
    await page.goto(`${BASE}/a/brightwave/admin/site`, { waitUntil: "networkidle" });
    await page.locator(".border-gray-200.rounded-lg", { hasText: newsTitle }).locator('button:has-text("Delete")').click();
    await page.waitForTimeout(300);
    await page.goto(`${BASE}/a/brightwave/admin/site`, { waitUntil: "networkidle" });

    text = await page.textContent("body");
    log("Smoke-test content blocks cleaned up after the test", !text.includes(textTitle) && !text.includes(newsTitle));
  }, "Academy homepage customization");

  // 18. Custom domain: an admin can connect their own domain, gets clear
  // validation errors along the way, sees the DNS instructions once a
  // domain is set, and can disconnect it again. Full DNS-based verification
  // can't be exercised here without a real external DNS record for a
  // domain we control, so this covers the parts that are meaningfully
  // testable end-to-end: input validation, the pending-verification DNS
  // instructions, and the "couldn't find that TXT record yet" failure path
  // against a domain with no real DNS behind it (a genuine negative-path
  // check, not a mock). The actual Host-based routing/rewrite in proxy.ts
  // was verified separately via direct HTTP requests with a spoofed Host
  // header (documented in the delivery notes), since a browser can't set
  // that header on navigation.
  await withPage(browser, async (page) => {
    await loginAs(page, "brightwave", "admin@brightwave.example", "Password123!");
    await page.goto(`${BASE}/a/brightwave/admin/settings`, { waitUntil: "networkidle" });

    // Read from the specific card rather than the whole page body: Next.js
    // leaves each server action's inline RSC flight payload (a
    // `self.__next_f.push(...)` script) sitting in the DOM after a
    // client-side transition, and `document.body.textContent` picks up
    // that script text too — including old values from earlier in this
    // same test (like the first test domain, still referenced in a stale
    // payload after it's been removed). Scoping to the visible card
    // avoids false positives/negatives from that accumulated history.
    const card = () => page.locator(".app-card", { hasText: "Custom domain" });
    // useActionState transitions are async and their timing isn't fully
    // predictable under shared-machine load (several form submissions in
    // a row on this same page in particular got noticeably slower deeper
    // into a full suite run) — poll for the specific expected text rather
    // than betting on a fixed sleep being long enough every time.
    const waitForCard = (fragment, timeout = 10000) =>
      page
        .waitForFunction(
          (needle) => {
            const el = [...document.querySelectorAll(".app-card")].find((c) => c.textContent.includes("Custom domain"));
            return !!el && el.textContent.includes(needle);
          },
          fragment,
          { timeout }
        )
        .catch(() => {});

    let text = await card().textContent();
    log("Custom domain card renders in the not-connected state", text.includes("Custom domain") && text.includes("Connect domain"));

    // Invalid input.
    await page.fill('input[name="custom_domain"]', "not a domain");
    await page.click('button:has-text("Connect domain")');
    await waitForCard("doesn't look like a valid domain");
    text = await card().textContent();
    log("Invalid domain input shows a clear validation error", text.includes("doesn't look like a valid domain"));

    // Platform's own domain.
    await page.fill('input[name="custom_domain"]', "skillsacademy.ai");
    await page.click('button:has-text("Connect domain")');
    await waitForCard("already used by the SkillsAcademy.ai platform");
    text = await card().textContent();
    log("Trying to connect the platform's own domain is rejected", text.includes("already used by the SkillsAcademy.ai platform"));

    // Valid domain -> pending verification state with DNS instructions.
    const testDomain = `smoketest-${Date.now()}.example.com`;
    await page.fill('input[name="custom_domain"]', testDomain);
    await page.click('button:has-text("Connect domain")');
    await waitForCard("Pending verification");
    text = await card().textContent();
    log("Setting a valid domain moves to the pending-verification state", text.includes("Pending verification"));
    log("DNS instructions show the connected domain and a CNAME target", text.includes(testDomain) && text.includes("CNAME"));
    log("DNS instructions show a TXT verification record", text.includes(`_skillsacademy-verify.${testDomain}`) && text.includes("TXT"));

    // Verifying against a domain with no real DNS behind it should fail
    // clearly rather than silently succeed or crash the page.
    await page.click('button:has-text("Verify")');
    await page
      .waitForFunction(
        () => {
          const el = [...document.querySelectorAll(".app-card")].find((c) => c.textContent.includes("Custom domain"));
          return el && (el.textContent.includes("Couldn't find a TXT record") || el.textContent.includes("doesn't match"));
        },
        { timeout: 15000 }
      )
      .catch(() => {});
    text = await card().textContent();
    log(
      "Verifying with no real DNS record in place shows a clear failure message",
      /couldn.t find a TXT record|doesn.t match/i.test(text)
    );
    log("Still pending after a failed verification attempt", text.includes("Pending verification"));

    // Super-admin visibility: while the domain is still connected (pending
    // verification), the platform admin should see it flagged on the
    // academies list so they know a domain is in flight. The session
    // cookie is a single global one, so logging in as super-admin here
    // simply replaces the academy-admin session in this same browser
    // context/page — same as a real person switching accounts.
    await page.goto(`${BASE}/super-admin/login`, { waitUntil: "networkidle" });
    await page.fill('input[name="email"]', "superadmin@skillsacademy.ai");
    await page.fill('input[name="password"]', "SuperAdmin123!");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }),
      page.click('button[type="submit"]'),
    ]);
    await page.goto(`${BASE}/super-admin/academies`, { waitUntil: "networkidle" });
    const superAdminText = await page.textContent("body");
    log(
      "Super-admin academies list flags the pending custom domain",
      superAdminText.includes(testDomain) && superAdminText.includes("Pending verification")
    );

    // Clean up: log back in as the academy admin and remove the domain so
    // repeated runs start from a clean slate.
    await loginAs(page, "brightwave", "admin@brightwave.example", "Password123!");
    await page.goto(`${BASE}/a/brightwave/admin/settings`, { waitUntil: "networkidle" });
    await page.click('button:has-text("Remove domain")');
    await page
      .waitForFunction(
        () => {
          const el = [...document.querySelectorAll(".app-card")].find((c) => c.textContent.includes("Custom domain"));
          return el && el.textContent.includes("Connect domain");
        },
        { timeout: 15000 }
      )
      .catch(() => {});
    text = await card().textContent();
    log("Removing the domain returns to the not-connected state", text.includes("Connect domain") && !text.includes(testDomain));
  }, "Custom domain settings");

  // 20. Login page no longer exposes the old shared demo credentials, and
  // links through to the new forgot-password flow instead.
  await withPage(browser, async (page) => {
    const resp = await page.goto(`${BASE}/a/brightwave/login`, { waitUntil: "networkidle" });
    const text = await page.textContent("body");
    log(
      "Tenant login page no longer shows demo credentials",
      resp.ok() && !text.includes("Password123") && !/password:\s*Password/i.test(text)
    );
    const forgotLinkCount = await page.locator('a[href="/a/brightwave/forgot-password"]').count();
    log("Tenant login page links to the forgot-password page", forgotLinkCount > 0);
  }, "Login page no longer shows demo hint");

  // 21. Forgot-password always shows the same generic message, whether or
  // not the email actually matches an account — this is what stops the
  // form being used to enumerate registered emails at an academy.
  await withPage(browser, async (page) => {
    const waitForGenericMessage = () =>
      page
        .waitForFunction(() => /sent a link to reset your password/i.test(document.body.textContent), { timeout: 10000 })
        .catch(() => {});

    await page.goto(`${BASE}/a/brightwave/forgot-password`, { waitUntil: "networkidle" });
    await page.fill('input[name="email"]', "admin@brightwave.example");
    await page.click('button[type="submit"]');
    await waitForGenericMessage();
    let text = await page.textContent("body");
    log("Forgot-password shows the generic message for a real account", /sent a link to reset your password/i.test(text));

    await page.goto(`${BASE}/a/brightwave/forgot-password`, { waitUntil: "networkidle" });
    await page.fill('input[name="email"]', "definitely-not-a-real-account@nowhere.example");
    await page.click('button[type="submit"]');
    await waitForGenericMessage();
    text = await page.textContent("body");
    log("Forgot-password shows the SAME generic message for a nonexistent account", /sent a link to reset your password/i.test(text));
  }, "Forgot-password enumeration safety");

  // 22. Full password-reset lifecycle against a real emailed token: request
  // a reset, read the (locally captured) email link, use it to set a new
  // password, confirm it auto-logs the user in, confirm the old password no
  // longer works while the new one does, and confirm an already-used or
  // bogus token is rejected without crashing the page. Uses the northgate
  // admin account, which this script doesn't log into again afterward, so
  // changing its password here doesn't affect any later check.
  await withPage(browser, async (page) => {
    const requestedAt = Date.now();
    await page.goto(`${BASE}/a/northgate/forgot-password`, { waitUntil: "networkidle" });
    await page.fill('input[name="email"]', "admin@northgate.example");
    await page.click('button[type="submit"]');
    await page
      .waitForFunction(() => /sent a link to reset your password/i.test(document.body.textContent), { timeout: 10000 })
      .catch(() => {});

    const email = await waitForEmailTo("admin@northgate.example", requestedAt);
    const token = email && extractResetToken(email.text);
    log(
      "Password-reset email was captured with a usable token",
      !!token,
      email ? "" : `no debug email file found at ${EMAIL_DEBUG_PATH}`
    );
    if (!token) return;

    await page.goto(`${BASE}/a/northgate/reset-password?token=${token}`, { waitUntil: "networkidle" });
    await page.fill('input[name="password"]', "SmokeTestReset987!");
    await page.fill('input[name="confirmPassword"]', "SmokeTestReset987!");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }),
      page.click('button[type="submit"]'),
    ]);
    log("Setting a new password via a valid token auto-logs the user in", page.url().includes("/a/northgate/admin"), page.url());

    // Old password should now be rejected. No redirect happens on a failed
    // login, so poll for the error text instead of waiting for navigation.
    await page.goto(`${BASE}/a/northgate/login`, { waitUntil: "networkidle" });
    await page.fill('input[name="email"]', "admin@northgate.example");
    await page.fill('input[name="password"]', "Password123!");
    await page.click('button[type="submit"]');
    await page
      .waitForFunction(() => /invalid email or password/i.test(document.body.textContent), { timeout: 10000 })
      .catch(() => {});
    const loginText = await page.textContent("body");
    log("Old password no longer works after reset", /invalid email or password/i.test(loginText));

    // New password should work.
    await loginAs(page, "northgate", "admin@northgate.example", "SmokeTestReset987!");
    log("New password logs in successfully", page.url().includes("/a/northgate/admin"), page.url());

    // Reusing the same (already-used) token should be rejected.
    await page.goto(`${BASE}/a/northgate/reset-password?token=${token}`, { waitUntil: "networkidle" });
    await page.fill('input[name="password"]', "AnotherOne123!");
    await page.fill('input[name="confirmPassword"]', "AnotherOne123!");
    await page.click('button[type="submit"]');
    await page
      .waitForFunction(() => /invalid or has expired/i.test(document.body.textContent), { timeout: 10000 })
      .catch(() => {});
    const reuseText = await page.textContent("body");
    log("An already-used reset token is rejected", /invalid or has expired/i.test(reuseText));

    // A bogus/malformed token should also be rejected, not crash the page.
    await page.goto(`${BASE}/a/northgate/reset-password?token=not-a-real-token`, { waitUntil: "networkidle" });
    await page.fill('input[name="password"]', "AnotherOne123!");
    await page.fill('input[name="confirmPassword"]', "AnotherOne123!");
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => /invalid/i.test(document.body.textContent), { timeout: 10000 }).catch(() => {});
    const bogusText = await page.textContent("body");
    log("A bogus reset token is rejected without crashing", /invalid/i.test(bogusText));
  }, "Full password-reset lifecycle");

  // 23. Visiting the reset-password page with no token at all shows a
  // request-a-new-link notice rather than a (uselessly submittable) form.
  await withPage(browser, async (page) => {
    const resp = await page.goto(`${BASE}/a/northgate/reset-password`, { waitUntil: "networkidle" });
    const text = await page.textContent("body");
    const passwordFieldCount = await page.locator('input[name="password"]').count();
    log(
      "Reset-password page with no token shows a request-a-new-link notice instead of a form",
      resp.ok() && passwordFieldCount === 0 && /reset link from your email/i.test(text)
    );
  }, "Reset-password page with no token");

  // 24. New people created via the admin "People" page no longer get a
  // known shared password (the old Password123! for every new account) —
  // they're emailed a "set your password" link instead, using the same
  // mechanism as the forgot-password flow.
  await withPage(browser, async (page) => {
    await loginAs(page, "brightwave", "admin@brightwave.example", "Password123!");
    await page.goto(`${BASE}/a/brightwave/admin/people`, { waitUntil: "networkidle" });
    const peopleText = await page.textContent("body");
    log("People page no longer mentions the old shared password", !peopleText.includes("Password123!"));
    log("People page explains new people get an email instead", /email them a link/i.test(peopleText));

    // Uses a gmail.com-shaped address rather than the reserved .example
    // TLD, since new accounts now go through a real DNS mail-domain check
    // (see check #27 below) and .example deliberately has no real DNS
    // records at all (RFC 2606) — this test is about the emailed
    // set-password link, not email validation, so it needs an address
    // that validation actually accepts.
    const testEmail = `smoke-test-learner-${Date.now()}@gmail.com`;
    const requestedAt = Date.now();
    await page.fill('input[name="name"]', "Smoke Test Learner");
    await page.fill('input[name="email"]', testEmail);
    await page.click('button:has-text("Add Person")');
    await page
      .waitForFunction((name) => document.body.textContent.includes(name), "Smoke Test Learner", { timeout: 10000 })
      .catch(() => {});
    const afterAddText = await page.textContent("body");
    log("New learner appears in the People list", afterAddText.includes("Smoke Test Learner"));

    const email = await waitForEmailTo(testEmail, requestedAt);
    const token = email && extractResetToken(email.text);
    log(
      "New learner is emailed a working set-password link instead of a shared password",
      !!token && /set your password/i.test(email.subject || ""),
      email ? "" : `no debug email file found at ${EMAIL_DEBUG_PATH}`
    );
    if (!token) return;

    await page.goto(`${BASE}/a/brightwave/reset-password?token=${token}`, { waitUntil: "networkidle" });
    await page.fill('input[name="password"]', "SmokeTestLearner456!");
    await page.fill('input[name="confirmPassword"]', "SmokeTestLearner456!");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }),
      page.click('button[type="submit"]'),
    ]);
    log("New learner's set-password link logs them straight in", page.url().includes("/a/brightwave/learner"), page.url());
  }, "New person gets a set-password email, not a shared password");

  // 25. Learners can self-register for an academy directly, without an
  // admin creating their account first — picking their own password and
  // getting logged straight in, same as the set-password flow above but
  // entirely self-initiated.
  await withPage(browser, async (page) => {
    const registerLinkOnLogin = await page.goto(`${BASE}/a/brightwave/login`, { waitUntil: "networkidle" }).then(async () => {
      const count = await page.locator('a[href="/a/brightwave/register"]').count();
      return count > 0;
    });
    log("Login page links to self-registration", registerLinkOnLogin);

    const publicPageRegisterLinks = await page
      .goto(`${BASE}/a/brightwave`, { waitUntil: "networkidle" })
      .then(() => page.locator('a[href="/a/brightwave/register"]').count());
    log("Public academy page offers a create-account CTA", publicPageRegisterLinks > 0, `found ${publicPageRegisterLinks}`);

    const testEmail = `smoke-test-register-${Date.now()}@example.com`;
    await page.goto(`${BASE}/a/brightwave/register`, { waitUntil: "networkidle" });
    await page.fill('input[name="name"]', "Smoke Test Registrant");
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="password"]', "SmokeSelfReg123!");
    await page.fill('input[name="confirmPassword"]', "SmokeSelfReg123!");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }),
      page.click('button[type="submit"]'),
    ]);
    log("Self-registering as a learner logs the new account straight in", page.url().includes("/a/brightwave/learner"), page.url());

    // Registering the same email again should be rejected, not create a
    // second account or silently overwrite the first one.
    await page.goto(`${BASE}/a/brightwave/register`, { waitUntil: "networkidle" });
    await page.fill('input[name="name"]', "Duplicate Attempt");
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="password"]', "SomeOtherPass456!");
    await page.fill('input[name="confirmPassword"]', "SomeOtherPass456!");
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => /already exists/i.test(document.body.textContent), { timeout: 10000 }).catch(() => {});
    const dupText = await page.textContent("body");
    log("Registering with an already-used email is rejected", /already exists/i.test(dupText));

    // A mismatched confirmation password should be rejected before an
    // account is created.
    await page.goto(`${BASE}/a/brightwave/register`, { waitUntil: "networkidle" });
    await page.fill('input[name="name"]', "Mismatch Attempt");
    await page.fill('input[name="email"]', `smoke-test-mismatch-${Date.now()}@example.com`);
    await page.fill('input[name="password"]', "FirstPassword123!");
    await page.fill('input[name="confirmPassword"]', "SecondPassword456!");
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => /don.t match/i.test(document.body.textContent), { timeout: 10000 }).catch(() => {});
    const mismatchText = await page.textContent("body");
    log("Registering with mismatched passwords is rejected", /don.t match/i.test(mismatchText));

    // The account should persist correctly — a fresh login with the
    // self-chosen credentials should work independently of the session
    // set at registration time.
    await page.goto(`${BASE}/a/brightwave/login`, { waitUntil: "networkidle" });
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="password"]', "SmokeSelfReg123!");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }),
      page.click('button[type="submit"]'),
    ]);
    log("Logging back in with the self-registered credentials works", page.url().includes("/a/brightwave/learner"), page.url());
  }, "Learner self-registration");

  // 26. Real Stripe billing/payouts: this sandbox has no live
  // STRIPE_SECRET_KEY, so these checks cover the graceful-degradation
  // paths every Stripe-dependent surface must show instead of crashing or
  // pretending to move real money — the same "not configured yet" pattern
  // established for RESEND_API_KEY in the password-reset feature. A real
  // deployment with Stripe configured would exercise the actual Checkout /
  // webhook / payouts code paths instead, which can't be smoke-tested here
  // without live Stripe credentials.
  await withPage(browser, async (page) => {
    await page.goto(`${BASE}/super-admin/login`, { waitUntil: "networkidle" });
    await page.fill('input[name="email"]', "superadmin@skillsacademy.ai");
    await page.fill('input[name="password"]', "SuperAdmin123!");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }),
      page.click('button[type="submit"]'),
    ]);

    const payoutsResp = await page.goto(`${BASE}/super-admin/payouts`, { waitUntil: "networkidle" });
    log("Payouts page loads", payoutsResp.ok(), `status ${payoutsResp.status()}`);
    const payoutsText = await page.textContent("body");
    log("Payouts page shows not-connected setup instructions", payoutsText.includes("isn’t connected yet") || payoutsText.includes("isn't connected yet"));
    log("Payouts setup instructions mention a monthly payout schedule", /monthly/i.test(payoutsText));
    log("Payouts page shows total real revenue collected", payoutsText.includes("Total real subscription revenue"));

    const plansResp = await page.goto(`${BASE}/super-admin/plans`, { waitUntil: "networkidle" });
    log("Plans page loads", plansResp.ok(), `status ${plansResp.status()}`);
    const plansText = await page.textContent("body");
    log("Plans page shows the Sync plans to Stripe button", plansText.includes("Sync plans to Stripe"));
    log("Plans page shows a not-synced-to-Stripe badge on each plan", /not synced to stripe yet/i.test(plansText));

    await page.click('button:has-text("Sync plans to Stripe")');
    await page.waitForFunction(() => /STRIPE_SECRET_KEY/i.test(document.body.textContent), { timeout: 10000 }).catch(() => {});
    const afterSyncText = await page.textContent("body");
    log("Syncing without a Stripe key shows a clear setup error", /STRIPE_SECRET_KEY/i.test(afterSyncText));
  }, "Stripe: super admin (not configured)");

  await withPage(browser, async (page) => {
    await loginAs(page, "brightwave", "admin@brightwave.example", "Password123!");
    await page.goto(`${BASE}/a/brightwave/admin/billing`, { waitUntil: "networkidle" });
    const billingText = await page.textContent("body");
    log("Billing page no longer describes checkout as simulated", !/simulated checkout/i.test(billingText));
    log("Billing page has no card-number input (Stripe hosts card entry)", (await page.locator('input[name="cardNumber"]').count()) === 0);
    log("Billing page offers to continue to Stripe's secure checkout", billingText.includes("Continue to secure checkout"));

    await page.click('button:has-text("Continue to secure checkout")');
    await page.waitForFunction(() => /aren.t set up yet/i.test(document.body.textContent), { timeout: 10000 }).catch(() => {});
    const subscribeErrorText = await page.textContent("body");
    log("Subscribing without Stripe configured shows a clear error, not a crash", /aren.t set up yet/i.test(subscribeErrorText));
  }, "Stripe: tenant billing (not configured)");

  // 27. Real email validation: every place a *new* email address is
  // captured (academy signup, admin adding an instructor/learner, learner
  // self-registration) now rejects addresses whose domain genuinely can't
  // receive mail (checked via a real DNS MX/A lookup, not just a regex),
  // not just malformed ones. A real, deliverable-looking domain (gmail.com)
  // must still be accepted. See lib/emailValidation.ts.
  await withPage(browser, async (page) => {
    const fakeDomain = "this-domain-should-not-exist-abcxyz123456789.com";

    // Learner self-registration.
    await page.goto(`${BASE}/a/brightwave/register`, { waitUntil: "networkidle" });
    await page.fill('input[name="name"]', "Fake Email Test");
    await page.fill('input[name="email"]', `test-${Date.now()}@${fakeDomain}`);
    await page.fill('input[name="password"]', "TestPass123!");
    await page.fill('input[name="confirmPassword"]', "TestPass123!");
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => /couldn.t find a mail server/i.test(document.body.textContent), { timeout: 10000 }).catch(() => {});
    let text = await page.textContent("body");
    log("Self-registration rejects an email with no real mail domain", /couldn.t find a mail server/i.test(text));

    await page.goto(`${BASE}/a/brightwave/register`, { waitUntil: "networkidle" });
    const realEmail = `smoke-real-domain-${Date.now()}@gmail.com`;
    await page.fill('input[name="name"]', "Real Email Test");
    await page.fill('input[name="email"]', realEmail);
    await page.fill('input[name="password"]', "TestPass123!");
    await page.fill('input[name="confirmPassword"]', "TestPass123!");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }),
      page.click('button[type="submit"]'),
    ]);
    log("Self-registration still accepts a real, deliverable email domain", page.url().includes("/learner"), page.url());

    // Academy admin sign-up wizard (final step).
    await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
    await page.fill('input[placeholder="e.g. Brightwave Consulting"]', `Email Validation Test Org ${Date.now()}`);
    await page.click('button:has-text("Continue")');
    await page.click('button:has-text("Continue")');
    await page.locator(".tier-card").first().click();
    await page.click('button:has-text("Continue")');
    await page.fill('input[name="adminName"]', "Admin Email Test");
    await page.fill('input[name="adminEmail"]', `admin-${Date.now()}@${fakeDomain}`);
    await page.fill('input[name="password"]', "TestPass123!");
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => /couldn.t find a mail server/i.test(document.body.textContent), { timeout: 10000 }).catch(() => {});
    text = await page.textContent("body");
    log("Academy sign-up rejects an admin email with no real mail domain", /couldn.t find a mail server/i.test(text));

    // Admin People page: adding an instructor/learner.
    await loginAs(page, "brightwave", "admin@brightwave.example", "Password123!");
    await page.goto(`${BASE}/a/brightwave/admin/people`, { waitUntil: "networkidle" });
    await page.fill('input[name="name"]', "Fake Email Person");
    await page.fill('input[name="email"]', `person-${Date.now()}@${fakeDomain}`);
    await page.click('button[type="submit"]:has-text("Add Person")');
    await page.waitForFunction(() => /couldn.t find a mail server/i.test(document.body.textContent), { timeout: 10000 }).catch(() => {});
    text = await page.textContent("body");
    log("Admin People page rejects a new person's email with no real mail domain", /couldn.t find a mail server/i.test(text));
  }, "Real email validation");

  // 28. Academy admin can set a new instructor/learner's password directly
  // instead of only ever emailing a set-password link — the new person can
  // then log in immediately with that password.
  await withPage(browser, async (page) => {
    await loginAs(page, "brightwave", "admin@brightwave.example", "Password123!");
    await page.goto(`${BASE}/a/brightwave/admin/people`, { waitUntil: "networkidle" });

    const newEmail = `smoke-admin-set-password-${Date.now()}@gmail.com`;
    await page.fill('input[name="name"]', "Admin Set Password Person");
    await page.fill('input[name="email"]', newEmail);
    await page.check('input[type="checkbox"]');
    await page.fill('input[name="password"]', "AdminSetPass123!");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }).catch(() => {}),
      page.click('button[type="submit"]:has-text("Add Person")'),
    ]);

    await page.goto(`${BASE}/a/brightwave/login`, { waitUntil: "networkidle" });
    await page.fill('input[name="email"]', newEmail);
    await page.fill('input[name="password"]', "AdminSetPass123!");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }),
      page.click('button[type="submit"]'),
    ]);
    log("New person can log in immediately with the password the admin set", page.url().includes("/learner"), page.url());
  }, "Admin sets a new person's password directly");

  // 29. Super admin: an academy sitting in the "Deleted academies" section
  // can be erased for good ("Delete Permanently"), not just restored — and
  // once erased it no longer appears anywhere on the Academies page,
  // including the Deleted section. Creates its own disposable academy via
  // the public signup wizard first (rather than reusing a seeded demo
  // academy), so this test can't collide with anything relied on
  // elsewhere, and permanently deleting it can't break a later run.
  await withPage(browser, async (page) => {
    const orgName = `Permanent Delete Test Org ${Date.now()}`;

    await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
    await page.fill('input[placeholder="e.g. Brightwave Consulting"]', orgName);
    await page.click('button:has-text("Continue")');
    await page.click('button:has-text("Continue")');
    await page.locator(".tier-card").first().click();
    await page.click('button:has-text("Continue")');
    await page.fill('input[name="adminName"]', "Permanent Delete Admin");
    await page.fill('input[name="adminEmail"]', `permadelete-${Date.now()}@gmail.com`);
    await page.fill('input[name="password"]', "TestPass123!");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }),
      page.click('button[type="submit"]'),
    ]);
    log("Throwaway academy created for the permanent-delete test", page.url().includes("/admin"), page.url());

    await page.goto(`${BASE}/super-admin/login`, { waitUntil: "networkidle" });
    await page.fill('input[name="email"]', "superadmin@skillsacademy.ai");
    await page.fill('input[name="password"]', "SuperAdmin123!");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }),
      page.click('button[type="submit"]'),
    ]);

    await page.goto(`${BASE}/super-admin/academies`, { waitUntil: "networkidle" });
    log("New academy appears in the main Academies list", (await page.textContent("body")).includes(orgName));

    // Soft-delete it first — Delete Permanently only ever appears in the
    // Deleted academies section, on an academy that's already deleted.
    await page.locator(".app-card", { hasText: orgName }).locator('button:has-text("Delete Academy")').click();
    await page.waitForTimeout(500);

    await page.goto(`${BASE}/super-admin/academies`, { waitUntil: "networkidle" });
    const details = page.locator("details", { hasText: "Deleted academies" });
    await details.locator("summary").click();
    const deletedCard = details.locator(".app-card", { hasText: orgName });
    log("Newly deleted academy shows up in the Deleted academies section with a Delete Permanently option", (await deletedCard.locator('button:has-text("Delete Permanently")').count()) > 0);

    // Delete Permanently asks for browser confirmation first — accept it.
    page.on("dialog", (dialog) => dialog.accept());
    await deletedCard.locator('button:has-text("Delete Permanently")').click();
    await page.waitForTimeout(800);

    await page.goto(`${BASE}/super-admin/academies`, { waitUntil: "networkidle" });
    const finalText = await page.textContent("body");
    log("Permanently deleted academy no longer appears anywhere on the Academies page (main or Deleted section)", !finalText.includes(orgName));
  }, "Super admin: permanently delete an academy");

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
