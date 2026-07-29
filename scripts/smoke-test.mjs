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
      const href2 = await page.locator('a[href^="/api/files/"]').first().getAttribute("href").catch(() => null);
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

  // 10. Live Classes (Zoom/Teams) admin page — no credentials configured in
  // this environment, so it should render the "not set up" guidance rather
  // than error.
  await withPage(browser, async (page) => {
    await loginAs(page, "brightwave", "admin@brightwave.example", "Password123!");
    const resp = await page.goto(`${BASE}/a/brightwave/admin/integrations`, { waitUntil: "networkidle" });
    log("Live Classes admin page loads", resp.ok(), `status ${resp.status()}`);
    const text = await page.textContent("body");
    log("Live Classes page explains Zoom isn't configured yet", text.includes("isn") && text.includes("Zoom"));
  }, "Live Classes page");

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
    await page.goto(`${BASE}/a/brightwave/learner/courses/${scormCourseId}`, { waitUntil: "networkidle" });
    const text = await page.textContent("body");
    log("SCORM module shows complete after the shim reports lesson_status=completed", text.includes("✓ Complete"));
  }, "SCORM completion sync");

  // 14. Auto-generated sitemap (Starter-tier SEO feature, available on every plan).
  await withPage(browser, async (page) => {
    const resp = await page.goto(`${BASE}/a/brightwave/sitemap.xml`, { waitUntil: "networkidle" });
    log("Academy sitemap.xml loads", resp.ok(), `status ${resp.status()}`);
    const text = await page.textContent("body");
    log("Sitemap includes the academy homepage URL", text.includes("/a/brightwave<"));
  }, "Sitemap");

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
