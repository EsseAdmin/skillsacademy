// Browser end-to-end test for pass 36: AI academy generation plans courses only, the content
// agent builds usable modules from one prompt, company logo at sign-up and on the site, and the
// minimal academy home page (headline, tagline, courses) with optional admin-added sections.
// It runs its own fake Anthropic API on port 4020, so the app under test must be started with
//   ANTHROPIC_API_KEY=sk-ant-fake ANTHROPIC_BASE_URL=http://localhost:4020 NODE_OPTIONS="-r ./scripts/test-dns-stub.cjs"
// Run (seeded database, app on port 3200):
//   AGENT_TEST_BASE_URL=http://localhost:3200 DATABASE_URL=postgres://… node scripts/content-agent-e2e.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const pg = require("pg");

const BASE = process.env.AGENT_TEST_BASE_URL || "http://localhost:3200";
const SLUG = "brightwave";
const SHOTS = process.env.AGENT_TEST_SHOTS || "";
let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail ? " :: " + detail : ""}`);
}
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// ---------------- fake Anthropic API ----------------
const calls = []; // tool names in order
let failMeLeft = 1; // the "FAILME" module fails this many times, then works
const words = (n, w) => Array.from({ length: n }, (_, i) => `${w} point number ${i + 1} explained clearly for learners`).join(". ") + ".";
const SVG = `<svg viewBox="0 0 800 450"><rect width="800" height="450" fill="#e8f0f2"/><rect x="60" y="230" width="680" height="30" fill="#8a6b4a"/><circle cx="300" cy="120" r="40" fill="#f2c9a5"/><rect x="260" y="160" width="80" height="80" rx="14" fill="#1f6f78"/><rect x="420" y="140" width="190" height="100" rx="8" fill="#222"/><circle cx="560" cy="110" r="34" fill="#e8b48e"/></svg>`;
function toolInput(name, text) {
  switch (name) {
    case "create_academy_plan":
      return {
        academyName: "Harbor Safety Academy", slugSuggestion: "harbor-safety", heroHeadline: "Safer ports start here", heroTagline: "Practical safety training for harbour teams.",
        template: { name: "Calm Teal", description: "Teal and charcoal.", primary_color: "#0F5C66", secondary_color: "#2B3A42", accent_color: "#E07A3F", font_heading: "Inter" },
        courses: [
          { title: "Workplace First Aid", description: "Respond to common emergencies with confidence.", category: "Safety", courseType: "SELF_PACED", level: "BEGINNER", studyHours: 4 },
          { title: "Fire Safety Certification", description: "Become a certified fire marshal.", category: "Safety", courseType: "CERTIFICATION", level: "INTERMEDIATE", studyHours: 8 },
          { title: "Manual Handling Workshop", description: "Hands-on lifting technique.", category: "Safety", courseType: "INSTRUCTOR_LED", level: "BEGINNER", studyHours: 3 },
        ],
        // A misbehaving model that also sends modules and About text must have them ignored.
        modules: [{ title: "SHOULD NOT EXIST" }], aboutText: "SHOULD NOT SHOW",
      };
    case "plan_modules": {
      const courses = [...text.matchAll(/- id: (\S+) \| ([^\n—]+)/g)].map((m) => ({ id: m[1], title: m[2].trim() }));
      const req = text.split('Request:\n"""\n')[1] || "";
      const chosen = (text.match(/already chose course id (\S+?)\./) || [])[1];
      if (/unclear/i.test(req)) return { modules: [], question: "Which course should I add this to?" };
      const course = courses.find((c) => c.id === chosen) || courses.find((c) => req.toLowerCase().includes(c.title.toLowerCase()));
      if (/FAILME/.test(req)) return { courseId: course?.id, modules: [{ title: "FAILME written lesson", kind: "TEXT", description: "A lesson that fails once.", brief: "Write about FAILME." }] };
      return {
        courseId: course?.id,
        modules: [
          { title: "Evacuation procedures deck", kind: "SLIDES", description: "How to evacuate safely.", brief: "Cover alarms, routes and assembly points.", exercises: true },
          { title: "Fire safety quiz", kind: "SCORM", description: "A short interactive check.", brief: "Four questions." },
          { title: "Giving feedback handout", kind: "DOCUMENT", description: "A Word handout.", brief: "One page of tips." },
        ],
      };
    }
    case "write_slide_deck":
      return { deckTitle: "Evacuation procedures", slides: Array.from({ length: 7 }, (_, i) => ({ title: `Slide ${i + 1}: key idea`, bullets: ["Know the alarm sound", "Use the nearest safe exit", "Never use lifts", "Meet at the assembly point"], notes: words(3, "Say") })) };
    case "write_handout":
      return { title: "Giving feedback", intro: words(2, "Intro"), sections: Array.from({ length: 5 }, (_, i) => ({ heading: `Section ${i + 1}`, paragraphs: [words(3, "Para"), words(2, "More")], bullets: ["Be specific", "Be timely"] })) };
    case "write_exercises":
      return { title: "Exercises: Evacuation", intro: words(2, "Do"), sections: Array.from({ length: 5 }, (_, i) => ({ heading: i < 4 ? `Exercise ${i + 1}: Spot the risk` : "Reflection", paragraphs: [words(3, "Task")], bullets: ["Check your answer"] })) };
    case "write_elearning_lesson":
      return {
        title: "Fire safety check", passMarkPct: 70,
        pages: Array.from({ length: 4 }, (_, i) => ({ heading: `Page ${i + 1}`, paragraphs: [words(3, "Learn")], bullets: ["Remember this"] })),
        questions: Array.from({ length: 4 }, (_, i) => ({ question: `Question ${i + 1}: what should you do first?`, options: ["Raise the alarm", "Ignore it", "Hide"], correctIndex: 0, explanation: "Raising the alarm protects everyone." })),
      };
    case "write_video_script":
      return { script: words(20, "Scene"), durationMinutes: 4 };
    case "write_text_lesson":
      return { title: "Lesson", description: "A complete written lesson.", content: Array.from({ length: 6 }, () => words(6, "Idea")).join("\n\n") };
    case "draw_illustration":
      return { svg: SVG };
    default:
      return {};
  }
}
const fake = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    let j = {};
    try { j = JSON.parse(body); } catch { /* ignore */ }
    const name = j.tool_choice?.name || "";
    const text = JSON.stringify(j.messages?.[0]?.content ?? "") && (typeof j.messages?.[0]?.content === "string" ? j.messages[0].content : JSON.stringify(j.messages?.[0]?.content));
    if (!req.url.includes("/v1/messages")) { res.writeHead(404); res.end("{}"); return; }
    calls.push(name);
    if (/FAILME/.test(text) && name !== "plan_modules" && failMeLeft > 0) {
      failMeLeft--;
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ type: "error", error: { type: "api_error", message: "boom" } }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      id: "msg_fake", type: "message", role: "assistant", model: j.model || "fake", stop_reason: "tool_use", stop_sequence: null,
      content: [{ type: "tool_use", id: "tu_1", name, input: toolInput(name, text) }],
      usage: { input_tokens: 10, output_tokens: 10 },
    }));
  });
});
await new Promise((r) => fake.listen(4020, r));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
async function newPage(w = 1280) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  return page;
}
async function login(page, slug, email, pwd = "Password123!") {
  await page.goto(`${BASE}/a/${slug}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', pwd);
  await Promise.all([page.waitForURL(/\/(admin|instructor|learner)/), page.click('button[type="submit"]')]);
}
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const pngPath = path.join(os.tmpdir(), "agent-e2e-logo.png");
fs.writeFileSync(pngPath, png);

try {
  const academyId = (await db.query("SELECT id FROM academies WHERE slug = $1", [SLUG])).rows[0].id;
  const { rows: courses } = await db.query("SELECT id, title FROM courses WHERE academy_id = $1 ORDER BY title", [academyId]);
  const onboarding = courses.find((c) => /Client Onboarding/.test(c.title));
  const modulesIn = async (courseId) => (await db.query("SELECT m.id, m.title, m.content_type, m.file_name, m.file_path, m.content_text FROM course_modules cm JOIN modules m ON m.id = cm.module_id WHERE cm.course_id = $1 ORDER BY cm.order_index", [courseId])).rows;
  const before = (await modulesIn(onboarding.id)).length;

  // ----- content agent (admin): one prompt builds usable modules -----
  const admin = await newPage();
  await login(admin, SLUG, "admin@brightwave.example");
  await admin.goto(`${BASE}/a/${SLUG}/admin/content-agent`);
  check("agent page is a single prompt box", (await admin.locator('[data-testid="agent-prompt"]').count()) === 1);
  await admin.fill('[data-testid="agent-prompt"]', "For Client Onboarding Excellence make a PowerPoint on evacuation procedures with an exercise sheet, a SCORM quiz and a Word handout on giving feedback.");
  await admin.click('[data-testid="agent-submit"]');
  await admin.waitForSelector('[data-testid="agent-summary"]');
  const summary = await admin.locator('[data-testid="agent-summary"]').innerText();
  check("agent shows what it is creating", /Creating 4 modules/.test(summary) || /Creating 3 modules/.test(summary), summary.replace(/\n/g, " | ").slice(0, 160));
  await admin.waitForFunction(() => /Your content is ready/.test(document.body.innerText), null, { timeout: 90000 });
  const afterMods = await modulesIn(onboarding.id);
  const added = afterMods.slice(before);
  check("modules were created straight away (no review step)", added.length >= 3, added.map((m) => m.title).join(" | "));
  const ext = (m) => ((m.file_name || "").split(".").pop() || "").toLowerCase();
  const fileLike = (m) => ["pptx", "docx"].includes(ext(m)) || m.content_type === "SCORM";
  check("PowerPoint, Word and SCORM modules exist", added.some((m) => ext(m) === "pptx") && added.some((m) => ext(m) === "docx") && added.some((m) => m.content_type === "SCORM") && added.filter(fileLike).length >= 3, added.map((m) => m.file_name || m.content_type).join(","));
  check("the exercise sheet was added with the deck", added.some((m) => /xercises/i.test(m.title)), added.map((m) => m.title).join(" | "));
  check("no module is a placeholder draft", added.every((m) => !/draft|placeholder|to be written/i.test(m.title + (m.content_text || ""))));
  const toolNames = new Set(calls);
  check("the fake AI saw planning, writing and drawing calls", ["plan_modules", "write_slide_deck", "write_elearning_lesson", "write_handout", "write_exercises", "draw_illustration"].every((n) => toolNames.has(n)), [...toolNames].join(","));
  const { rows: pics } = await db.query("SELECT COUNT(*)::int AS n FROM modules m JOIN course_modules cm ON cm.module_id = m.id WHERE cm.course_id = $1 AND m.image_path IS NOT NULL", [onboarding.id]);
  check("new modules got drawn pictures", pics[0].n >= 1, String(pics[0].n));
  // the files are real, downloadable documents
  const firstFile = added.find((m) => ext(m) === "pptx");
  const dl = firstFile ? await admin.request.get(`${BASE}/api/files/${firstFile.id}`) : null;
  const dlBuf = dl ? await dl.body() : Buffer.alloc(0);
  check("the PowerPoint downloads as a real .pptx (zip) file", !!dl && dl.status() === 200 && dlBuf.length > 2000 && dlBuf.subarray(0, 2).toString() === "PK", dl ? `${dl.status()} ${dlBuf.length} bytes` : "no pptx");
  if (SHOTS) await admin.screenshot({ path: `${SHOTS}/agent-done.png`, fullPage: true });

  // unclear request → a question, nothing built
  await admin.goto(`${BASE}/a/${SLUG}/admin/content-agent`);
  const n0 = (await modulesIn(onboarding.id)).length;
  await admin.fill('[data-testid="agent-prompt"]', "Something unclear please add some stuff");
  await admin.click('[data-testid="agent-submit"]');
  await admin.waitForSelector('[data-testid="agent-question"]');
  check("an unclear request gets a question", /Which course/.test(await admin.locator('[data-testid="agent-question"]').innerText()));
  check("nothing was created for it", (await modulesIn(onboarding.id)).length === n0);

  // failure → friendly message + Try again works
  await admin.goto(`${BASE}/a/${SLUG}/admin/content-agent`);
  await admin.selectOption('[data-testid="agent-course"]', onboarding.id);
  await admin.fill('[data-testid="agent-prompt"]', "Write a FAILME lesson for this course.");
  await admin.click('[data-testid="agent-submit"]');
  await admin.waitForSelector('[data-testid="plan-build-progress"]');
  await admin.waitForFunction(() => /couldn.t be built/.test(document.body.innerText), null, { timeout: 60000 });
  const failText = await admin.locator('[data-testid="plan-build-progress"]').innerText();
  check("a failed file says so with a friendly reason and Try again", /Press .Try again./.test(failText) && /Try those again/.test(failText), failText.replace(/\n/g, " | ").slice(0, 200));
  check("no half-made FAILME module was left behind", !(await modulesIn(onboarding.id)).some((m) => /FAILME/.test(m.title)));
  await admin.click('button:has-text("Try those again")');
  await admin.waitForFunction(() => /Your content is ready/.test(document.body.innerText) && !/couldn.t be built/.test(document.body.innerText), null, { timeout: 60000 });
  const failme = (await modulesIn(onboarding.id)).find((m) => /FAILME/.test(m.title));
  check("Try again built the lesson as full written text", !!failme && (failme.content_text || "").length > 500, failme ? String((failme.content_text || "").length) : "missing");

  // ----- instructor sees only their own courses -----
  const instr = await newPage();
  await login(instr, SLUG, "instructor@brightwave.example");
  await instr.goto(`${BASE}/a/${SLUG}/instructor/content-agent`);
  const instrOpts = (await instr.locator('[data-testid="agent-course"] option').allInnerTexts()).filter((t) => !/Work it out/.test(t));
  const { rows: mine } = await db.query(
    `SELECT c.title FROM courses c WHERE c.academy_id = $1 AND (c.created_by = (SELECT id FROM users WHERE email = 'instructor@brightwave.example') OR EXISTS (SELECT 1 FROM course_instructors ci WHERE ci.course_id = c.id AND ci.instructor_id = (SELECT id FROM users WHERE email = 'instructor@brightwave.example')))`,
    [academyId]
  );
  check("instructor's course list matches their own courses", instrOpts.length === mine.length && instrOpts.every((t) => mine.some((m) => m.title === t.trim())), `${instrOpts.length} vs ${mine.length}`);

  // ----- Generate with AI: courses only, with drawn covers -----
  const { rows: acadBefore } = await db.query("SELECT COUNT(*)::int AS c FROM courses WHERE academy_id = $1", [academyId]);
  const modsBefore = (await db.query("SELECT COUNT(*)::int AS c FROM modules WHERE academy_id = $1", [academyId])).rows[0].c;
  await admin.goto(`${BASE}/a/${SLUG}/admin/ai-generate`);
  await admin.fill('textarea[name="prompt"]', "A harbour safety training academy: first aid, fire safety and manual handling.");
  await admin.click('button:has-text("Generate")');
  await admin.waitForSelector('button:has-text("Add to my academy")');
  const preview = await admin.locator("body").innerText();
  check("the preview lists courses but no modules", /Workplace First Aid/.test(preview) && !/SHOULD NOT EXIST/.test(preview));
  await admin.click('button:has-text("Add to my academy")');
  await admin.waitForFunction(() => /Added 3\s*course/.test(document.body.innerText), null, { timeout: 30000 }).catch(async (e) => {
    console.log("DEBUG page text:", (await admin.locator("body").innerText()).slice(-1500));
    throw e;
  });
  await admin.waitForFunction(() => /Your content is ready/.test(document.body.innerText), null, { timeout: 90000 });
  const { rows: acadAfter } = await db.query("SELECT COUNT(*)::int AS c FROM courses WHERE academy_id = $1", [academyId]);
  check("three courses were added", acadAfter[0].c === acadBefore[0].c + 3, `${acadBefore[0].c} → ${acadAfter[0].c}`);
  const modsAfter = (await db.query("SELECT COUNT(*)::int AS c FROM modules WHERE academy_id = $1", [academyId])).rows[0].c;
  check("no modules were created by the plan", modsAfter === modsBefore, `${modsBefore} → ${modsAfter}`);
  const { rows: newCourses } = await db.query("SELECT title, cover_image_path AS image_path FROM courses WHERE academy_id = $1 AND title IN ('Workplace First Aid','Fire Safety Certification','Manual Handling Workshop')", [academyId]);
  check("each new course got a drawn cover", newCourses.length === 3 && newCourses.every((c) => !!c.image_path), newCourses.map((c) => c.image_path).join(","));
  const aboutNow = (await db.query("SELECT about_text FROM academies WHERE id = $1", [academyId])).rows[0].about_text;
  check("the plan did not write an About text", !/SHOULD NOT SHOW/.test(aboutNow || ""));

  // ----- minimal public home page, then an admin-added section -----
  const visitor = await newPage();
  await visitor.goto(`${BASE}/a/${SLUG}`);
  const home = await visitor.locator("body").innerText();
  check("home page has no tiles, About, What you'll learn, news or journeys", (await visitor.locator('[data-testid="type-tile"], [data-testid="what-youll-learn"], [data-testid="journey-section"]').count()) === 0 && !/About Brightwave|SHOULD NOT SHOW/.test(home));
  check("home page shows the courses by type", (await visitor.locator('[data-testid="type-section"]').count()) >= 2);
  const heroImgs = await visitor.locator("img").evaluateAll((els) => els.map((e) => e.getAttribute("src") || ""));
  check("course cards show pictures", heroImgs.length >= 2, String(heroImgs.length));
  await admin.goto(`${BASE}/a/${SLUG}/admin/site`);
  await admin.click('button:has-text("What you’ll learn"), button:has-text("What you\'ll learn")');
  await admin.fill('input[name="title"]', "What you'll learn");
  await admin.fill('textarea[name="body_text"]', "Spot hazards early\nRespond calmly in an emergency\nWrite a clear incident report");
  await Promise.all([admin.waitForLoadState("networkidle"), admin.click('button:has-text("Add to homepage")')]);
  await admin.waitForTimeout(800);
  await visitor.goto(`${BASE}/a/${SLUG}`);
  const withBlock = await visitor.locator("body").innerText();
  check("an admin-added “What you'll learn” section appears", /Spot hazards early/.test(withBlock) && /Respond calmly in an emergency/.test(withBlock));
  if (SHOTS) await visitor.screenshot({ path: `${SHOTS}/home-min.png`, fullPage: true });

  // ----- logo at sign-up -----
  const org = `Logo Test Org ${Date.now()}`;
  const signup = await newPage();
  await signup.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
  await signup.fill('input[placeholder="e.g. Brightwave Consulting"]', org);
  await signup.click('button:has-text("Continue")');
  await signup.click('button:has-text("Continue")');
  await signup.locator(".tier-card").first().click();
  await signup.click('button:has-text("Continue")');
  check("sign-up has an optional company logo field", (await signup.locator('[data-testid="signup-logo"]').count()) === 1);
  await signup.fill('input[name="adminName"]', "Logo Admin");
  await signup.fill('input[name="adminEmail"]', `logo-${Date.now()}@gmail.com`);
  await signup.setInputFiles('[data-testid="signup-logo"]', pngPath);
  await signup.fill('input[name="password"]', "TestPass123!");
  await Promise.all([signup.waitForURL(/\/admin/, { timeout: 30000 }), signup.click('button[type="submit"]')]);
  check("academy created with a logo", true, signup.url());
  const logoRow = (await db.query("SELECT slug, logo_image_path FROM academies WHERE name = $1 OR logo_text = $1", [org])).rows[0];
  check("the logo is saved on the academy", !!logoRow?.logo_image_path, logoRow?.logo_image_path || "none");
  if (logoRow) {
    await signup.goto(`${BASE}/a/${logoRow.slug}/admin/site`);
    check("the admin site page shows the logo preview", (await signup.locator('[data-testid="academy-logo"]').count()) >= 1 || (await signup.locator('img[src*="logo"]').count()) >= 1);
    // a new academy's public page is just headline, tagline and courses
    await signup.goto(`${BASE}/a/${logoRow.slug}`);
    const newHome = await signup.locator("body").innerText();
    check("a new academy's page has no About or What you'll learn", !/What you.ll learn|About /i.test(newHome.replace(org, "")));
  }

  await db.query("DELETE FROM ai_build_jobs WHERE academy_id = $1 AND status = 'FAILED'", [academyId]);
} catch (e) {
  failures++;
  console.log("FAIL - unexpected error ::", e && e.stack ? e.stack : e);
} finally {
  await browser.close();
  fake.close();
  await db.end();
}
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
