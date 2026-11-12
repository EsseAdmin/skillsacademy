// Browser end-to-end test: an academy admin's Page designer (draft → preview → publish, pictures,
// sections, colours and fonts, history, AI rewrite/draw and its metering, access control). Runs its
// own fake Anthropic API on :4022, so the app must be started with
//   ANTHROPIC_API_KEY=sk-ant-fake ANTHROPIC_BASE_URL=http://localhost:4022
// Run (fresh seeded database, app on :3211; DATABASE_URL lets it check AI metering):
//   DESIGNER_TEST_BASE_URL=http://localhost:3211 DATABASE_URL=postgres://… node scripts/academy-designer-e2e.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const pg = process.env.DATABASE_URL ? require("pg") : null;

const BASE = process.env.DESIGNER_TEST_BASE_URL || "http://localhost:3211";
const SLUG = "brightwave";
const SHOTS = process.env.DESIGNER_TEST_SHOTS || "";
let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail ? " :: " + detail : ""}`);
}

// ---------- fake Anthropic API ----------
const calls = [];
const SVG = `<svg viewBox="0 0 800 450"><rect width="800" height="450" fill="#e8f0f2"/><rect x="60" y="230" width="680" height="30" fill="#8a6b4a"/><circle cx="300" cy="120" r="40" fill="#f2c9a5"/><rect x="260" y="160" width="80" height="80" rx="14" fill="#1f6f78"/></svg>`;
let drawPrompt = "";
let rewriteSystem = "";
const fake = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    let j = {};
    try { j = JSON.parse(body); } catch { /* ignore */ }
    const name = j.tool_choice?.name || "";
    calls.push(name);
    let input = {};
    if (name === "draw_illustration") {
      input = { svg: SVG };
      drawPrompt = String(j.messages?.[0]?.content || "");
    }
    if (name === "rewrite_section") {
      rewriteSystem = String(j.system || "");
      const text = String(j.messages?.[0]?.content || "");
      const section = JSON.parse(text.split("Section (JSON):\n")[1].split("\n\nRequest:")[0]);
      if ("headline" in section) section.headline = "Learn with confidence";
      else if ("title" in section) section.title = "Warm and welcoming";
      // a misbehaving model also tries to change a link, a picture and the colour: these must be ignored
      section.primaryHref = "https://evil.example";
      section.buttonHref = "https://evil.example";
      section.image = "evilpicture01.png";
      section.bg = "#ff0000";
      input = { section };
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: "msg_fake", type: "message", role: "assistant", model: "fake", stop_reason: "tool_use", stop_sequence: null, content: [{ type: "tool_use", id: "tu_1", name, input }], usage: { input_tokens: 5, output_tokens: 5 } }));
  });
});
await new Promise((r) => fake.listen(4022, r));

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const pngPath = path.join(os.tmpdir(), "designer-e2e-pic.png");
fs.writeFileSync(pngPath, png);
const badPath = path.join(os.tmpdir(), "designer-e2e-notimage.png");
fs.writeFileSync(badPath, "this is not a picture");

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const consoleProblems = [];
async function newPage(w = 1400) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 1000 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  page.on("dialog", (d) => d.accept());
  page.on("console", (m) => { if (m.type() === "error") consoleProblems.push(m.text()); });
  return page;
}
async function login(page, email, slug = SLUG, expect = /\/(admin|instructor|learner)/) {
  await page.goto(`${BASE}/a/${slug}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "Password123!");
  await Promise.all([page.waitForURL(expect), page.click('button[type="submit"]')]);
}
let ad;
const openMore = async () => {
  const d = ad.locator("details", { has: ad.locator("summary", { hasText: "More" }) });
  if ((await d.getAttribute("open")) === null) await d.locator("summary").click();
};
const status = async () => (await ad.locator('[data-testid="editor-status"]').innerText()).trim();
const waitStatus = (re) => ad.waitForFunction((src) => new RegExp(src).test(document.querySelector('[data-testid="editor-status"]').innerText), re.source);
const publicHtml = async (page) => {
  await page.goto(`${BASE}/a/${SLUG}`, { waitUntil: "networkidle" });
  return page.content();
};
const row = (text) => ad.locator('[data-testid="section-row"]', { hasText: text }).first();
const selectRow = (text) => row(text).locator("button").first().click();

async function db(sql, params = []) {
  if (!pg) return null;
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(sql, params)).rows;
  } finally {
    await c.end();
  }
}

try {
  const visitor = await newPage();
  const html0 = await publicHtml(visitor);
  const text0 = await visitor.locator("body").innerText();
  check("the public page starts as the original simple page", !html0.includes('data-testid="designed-site"') && (await visitor.locator("h1").count()) === 1);
  const originalHeadline = await visitor.locator("h1").innerText();

  // ----- access control -----
  const anon = await newPage();
  await anon.goto(`${BASE}/a/${SLUG}/admin/designer`);
  check("the designer needs a login", /\/login/.test(anon.url()), anon.url());
  await anon.goto(`${BASE}/a/${SLUG}/admin/designer/preview`);
  check("the draft preview needs a login", /\/login/.test(anon.url()), anon.url());
  const bad1 = await anon.request.get(`${BASE}/api/academy-page-image/${SLUG}/..%2F..%2Fetc%2Fpasswd`);
  const bad2 = await anon.request.get(`${BASE}/api/academy-page-image/${SLUG}/doesnotexist1.png`);
  const bad3 = await anon.request.get(`${BASE}/api/academy-page-image/no-such-academy/doesnotexist1.png`);
  check("the picture route refuses odd or missing names and academies", bad1.status() === 404 && bad2.status() === 404 && bad3.status() === 404);
  for (const [who, email] of [["instructor", "instructor@brightwave.example"], ["learner", "learner@brightwave.example"]]) {
    const p = await newPage();
    await login(p, email);
    await p.goto(`${BASE}/a/${SLUG}/admin/designer`);
    const denied = !/\/admin\/designer/.test(p.url()) || !(await p.locator('[data-testid="page-designer"]').count());
    check(`a ${who} can't open the designer`, denied, p.url());
    const r = await p.goto(`${BASE}/a/${SLUG}/admin/designer/preview`);
    check(`a ${who} can't open the preview`, !/\/admin\/designer\/preview/.test(p.url()) || (r && r.status() >= 400), p.url());
  }
  const other = await newPage();
  await login(other, "admin@riverside.example", "riverside");
  await other.goto(`${BASE}/a/${SLUG}/admin/designer`);
  check("another academy's admin can't open this designer", !/\/a\/brightwave\/admin\/designer/.test(other.url()) || !(await other.locator('[data-testid="page-designer"]').count()), other.url());

  // ----- the admin opens the designer -----
  ad = await newPage();
  await login(ad, "admin@brightwave.example");
  await ad.goto(`${BASE}/a/${SLUG}/admin/site`, { waitUntil: "networkidle" });
  check("Academy Site points to the Page designer", (await ad.locator('[data-testid="open-designer"]').count()) === 1);
  check("Page designer is in the admin menu", (await ad.locator(`a[href="/a/${SLUG}/admin/designer"]`).count()) >= 1);
  await ad.click('[data-testid="open-designer"]');
  await ad.waitForSelector('[data-testid="page-designer"]');
  const rowsAtStart = await ad.locator('[data-testid="section-row"]').allInnerTexts();
  check("it opens on a page built from the academy's current content: hero, courses and journeys at least", rowsAtStart.length >= 3 && /Hero/.test(rowsAtStart[0]) && rowsAtStart.some((r) => /Course list/.test(r)) && rowsAtStart.some((r) => /Learning journeys/.test(r)), rowsAtStart.join(" | "));
  check("the status says it's a draft, not live", /isn.t live yet/.test(await status()) && /original simple page/.test(await ad.locator('[data-testid="live-state"]').innerText()));
  check("visitors still see the original page", !(await publicHtml(visitor)).includes('data-testid="designed-site"'));
  if (SHOTS) await ad.screenshot({ path: `${SHOTS}/designer.png`, fullPage: true });

  // ----- edit the headline; draft only -----
  await selectRow("Hero");
  check("the hero starts with the academy's own headline", (await ad.inputValue('[data-testid="f-headline"]')).replace(/\s+/g, " ").trim() === originalHeadline.replace(/\s+/g, " ").trim());
  await ad.fill('[data-testid="f-headline"]', "Skills that *stick*");
  check("an edit marks the draft as unsaved", /Unsaved/.test(await status()));
  await ad.click('[data-testid="save-draft"]');
  await waitStatus(/Draft saved/);
  check("saving says visitors still see the live page", /still see the live page/.test(await ad.locator('[data-testid="editor-message"]').innerText()));
  check("…and the public page is unchanged", !/Skills that/.test((await publicHtml(visitor), await visitor.locator("body").innerText())));
  await ad.click('[data-testid="tab-preview"]');
  const frame = ad.frameLocator('[data-testid="preview-frame"]');
  await frame.locator("h1").waitFor();
  check("the Preview tab shows the draft, with the italic word", /Skills that stick/.test(await frame.locator("h1").innerText()) && (await frame.locator("h1 em").innerText()) === "stick");
  await ad.click('[data-testid="tab-edit"]');

  // ----- pictures -----
  await ad.setInputFiles('[data-testid="section-form"] [data-testid="image-file"]', badPath);
  await ad.waitForSelector('[data-testid="image-error"]');
  check("a file that isn't a picture is refused", /PNG, JPG/.test(await ad.locator('[data-testid="image-error"]').innerText()));
  await ad.setInputFiles('[data-testid="section-form"] [data-testid="image-file"]', pngPath);
  await ad.waitForSelector('[data-testid="image-thumb"]');
  const heroSrc = await ad.locator('[data-testid="image-thumb"]').getAttribute("src");
  check("an uploaded picture has this academy's picture address", new RegExp(`^/api/academy-page-image/${SLUG}/[a-z0-9-]+\\.png$`).test(heroSrc || ""), heroSrc || "");
  const pic = await ad.request.get(`${BASE}${heroSrc}`);
  check("the picture is served with safe headers", pic.status() === 200 && pic.headers()["x-content-type-options"] === "nosniff" && /image\/png/.test(pic.headers()["content-type"] || ""));
  const wrongAcademy = await anon.request.get(`${BASE}${(heroSrc || "").replace(`/${SLUG}/`, "/riverside/")}`);
  check("the same picture name isn't available under another academy", wrongAcademy.status() === 404);

  // ----- AI: draw -----
  await ad.click('[data-testid="ai-draw-toggle"]');
  await ad.fill('[data-testid="ai-draw-subject"]', "A trainer showing colleagues a laptop in a bright office");
  const usedBefore = pg ? Number((await db("SELECT count(*)::int AS n FROM ai_usage WHERE academy_id = (SELECT id FROM academies WHERE slug = $1)", [SLUG]))[0].n) : 0;
  await ad.click('[data-testid="ai-draw-go"]');
  await ad.waitForFunction((prev) => document.querySelector('[data-testid="image-thumb"]')?.getAttribute("src") !== prev, heroSrc);
  const aiSrc = await ad.locator('[data-testid="image-thumb"]').getAttribute("src");
  check("AI drew a picture and it was saved as an SVG in this academy's folder", new RegExp(`^/api/academy-page-image/${SLUG}/.+\\.svg$`).test(aiSrc || "") && calls.includes("draw_illustration"), aiSrc || "");
  check("the drawing prompt names the academy, not the platform", /training academy/.test(drawPrompt) && !/SkillsAcademy\.ai marketing website/.test(drawPrompt));
  const aiPic = await ad.request.get(`${BASE}${aiSrc}`);
  check("the drawing is served with a locked-down policy", aiPic.status() === 200 && /image\/svg/.test(aiPic.headers()["content-type"] || "") && /sandbox/.test(aiPic.headers()["content-security-policy"] || ""));

  // ----- AI: rewrite wording only -----
  await ad.click('[data-testid="ai-rewrite"] summary');
  await ad.fill('[data-testid="ai-rewrite-ask"]', "Make it more confident");
  await ad.click('[data-testid="ai-rewrite-go"]');
  await ad.waitForSelector('[data-testid="ai-rewrite-proposal"]');
  check("a rewrite is shown as a proposal first", /Learn with confidence/.test(await ad.locator('[data-testid="ai-rewrite-proposal"]').innerText()));
  check("the rewriter was told which academy it writes for", /training academy called "Brightwave/i.test(rewriteSystem), rewriteSystem.slice(0, 120));
  check("nothing changed before accepting", /Skills that/.test(await ad.inputValue('[data-testid="f-headline"]')));
  await ad.click('[data-testid="ai-rewrite-accept"]');
  check("accepting applies the new wording only", (await ad.inputValue('[data-testid="f-headline"]')) === "Learn with confidence");
  if (pg) {
    const usedAfter = Number((await db("SELECT count(*)::int AS n FROM ai_usage WHERE academy_id = (SELECT id FROM academies WHERE slug = $1)", [SLUG]))[0].n);
    check("both AI actions were counted against the academy's monthly allowance", usedAfter - usedBefore === 2, `${usedBefore} -> ${usedAfter}`);
  }
  // the monthly cap stops AI help with a friendly message
  if (pg) {
    const academy = (await db("SELECT id, plan_id FROM academies WHERE slug = $1", [SLUG]))[0];
    const plan = (await db("SELECT ai_monthly_limit FROM subscription_plans WHERE id = $1", [academy.plan_id]))[0];
    const used = Number((await db("SELECT count(*)::int AS n FROM ai_usage WHERE academy_id = $1 AND created_at >= $2", [academy.id, new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString()]))[0].n);
    await db("UPDATE subscription_plans SET ai_monthly_limit = $1 WHERE id = $2", [used, academy.plan_id]);
    await ad.fill('[data-testid="ai-rewrite-ask"]', "Make it shorter please");
    const callsBefore = calls.length;
    await ad.click('[data-testid="ai-rewrite-go"]');
    await ad.waitForSelector('[data-testid="ai-rewrite-error"]');
    check("at the monthly cap the AI is refused with a friendly message and no call is made", /used all .* AI actions/.test(await ad.locator('[data-testid="ai-rewrite-error"]').innerText()) && calls.length === callsBefore);
    await db("UPDATE subscription_plans SET ai_monthly_limit = $1 WHERE id = $2", [plan.ai_monthly_limit, academy.plan_id]);
  }

  // ----- add, move, hide; video; text escapes HTML -----
  await ad.click('[data-testid="add-section"]');
  await ad.click('[data-testid="add-text"]');
  await ad.fill('[data-testid="f-title"]', "Why choose us");
  await ad.fill('[data-testid="f-body"]', "First paragraph.\n\nSecond paragraph <b>not bold</b>.");
  const nRows = await ad.locator('[data-testid="section-row"]').count();
  check("a new section is added after the selected one", nRows === rowsAtStart.length + 1);
  const rows = ad.locator('[data-testid="section-row"]');
  check("the new section sits right below the hero", /Why choose us/.test(await rows.nth(1).innerText()));
  await rows.nth(1).locator('button[title="Move down"]').click();
  check("a section can be moved down", /Why choose us/.test(await rows.nth(2).innerText()));
  await rows.nth(2).locator('button[title="Move up"]').click();
  await ad.fill('[data-testid="f-bg"] >> xpath=../input[2]', "#0a5c36").catch(() => {});
  await ad.click('[data-testid="add-section"]');
  await ad.click('[data-testid="add-video"]');
  await ad.fill('[data-testid="f-video-url"]', "https://www.youtube.com/watch?v=abc123");
  await ad.fill('[data-testid="f-title"]', "Tour of the academy");
  await ad.click('[data-testid="add-section"]');
  await ad.click('[data-testid="add-news"]');
  await ad.fill('[data-testid="f-title"]', "Autumn term starts");
  await ad.click('[data-testid="add-section"]');
  await ad.click('[data-testid="add-banner"]');
  await ad.fill('[data-testid="f-title"]', "Hidden banner");
  await row("Hidden banner").locator('button[title="Show or hide"]').click();
  check("a section can be hidden", /hidden/.test(await row("Hidden banner").innerText()));

  // ----- colours, fonts, menu, footer -----
  await ad.click('[data-testid="select-site"]');
  await ad.locator('[data-testid="theme-primary"] >> xpath=following-sibling::input[1]').fill("#0a5c36");
  await ad.locator('[data-testid="theme-accent"] >> xpath=following-sibling::input[1]').fill("#ffcc00");
  await ad.locator('[data-testid="site-settings"] select').nth(0).selectOption("serif");
  await ad.locator('[data-testid="site-settings"] select').nth(1).selectOption("humanist");
  await ad.locator('[data-testid="site-settings"] input[placeholder*="automatic"]').nth(3).fill("Join us").catch(() => {});
  await ad.click('[data-testid="save-draft"]');
  await waitStatus(/Draft saved/);
  check("still nothing public after all those saved edits", !(await publicHtml(visitor)).includes('data-testid="designed-site"'));

  // ----- publish -----
  await ad.click('[data-testid="publish"]');
  await waitStatus(/Matches the live page/);
  const html1 = await publicHtml(visitor);
  const text1 = await visitor.locator("body").innerText();
  check("publishing updates the public page", html1.includes('data-testid="designed-site"') && /Learn with confidence/.test(text1) && /Why choose us/.test(text1) && /Autumn term starts/.test(text1) && /Tour of the academy/.test(text1));
  check("a hidden section is not shown", !/Hidden banner/.test(text1));
  check("the hero picture is the AI drawing", (await visitor.locator('[data-testid="hero-image"]').count()) === 1 && (await visitor.locator('[data-testid="hero-image"]').getAttribute("src")) === aiSrc);
  check("the AI rewrite didn't change links, picture or colour", !html1.includes("evil.example") && !html1.includes("evilpicture01") && !html1.includes("#ff0000"));
  check("HTML typed into text is shown as text", /<b>not bold<\/b>/.test(text1) && (await visitor.locator('[data-section-type="text"] b').count()) === 0);
  check("the video is embedded privately", (await visitor.locator('iframe[src*="youtube-nocookie.com/embed/abc123"]').count()) === 1);
  const primary = await visitor.evaluate(() => getComputedStyle(document.querySelector('[data-testid="designed-site"]')).getPropertyValue("--brand-primary").trim());
  const headingFont = await visitor.evaluate(() => getComputedStyle(document.querySelector("h1")).fontFamily);
  check("the new colours and fonts apply", primary.toLowerCase() === "#0a5c36" && /Georgia/.test(headingFont), `${primary} / ${headingFont}`);
  const courseCards = await visitor.locator('[data-testid="type-section"] a[href*="/courses/"], [data-section-type="courses"] a[href*="/courses/"]').count();
  check("the course list is still there, with the academy's published courses", courseCards > 0, String(courseCards));
  const hrefs = await visitor.locator('a[href*="/courses/"]').first().getAttribute("href");
  await visitor.locator('a[href*="/courses/"]').first().click();
  await visitor.waitForURL(/\/courses\//);
  check("a course card opens the course page", /\/a\/brightwave\/courses\//.test(visitor.url()), `${hrefs} -> ${visitor.url()}`);
  await visitor.setViewportSize({ width: 390, height: 800 });
  await visitor.goto(`${BASE}/a/${SLUG}`, { waitUntil: "networkidle" });
  const overflow = await visitor.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("phone width: no sideways scrolling on the designed page", overflow <= 1, String(overflow));
  if (SHOTS) {
    await visitor.screenshot({ path: `${SHOTS}/public-phone.png`, fullPage: true });
    await visitor.setViewportSize({ width: 1400, height: 1000 });
    await visitor.screenshot({ path: `${SHOTS}/public-desktop.png`, fullPage: true });
  }
  await visitor.setViewportSize({ width: 1400, height: 1000 });
  await ad.goto(`${BASE}/a/${SLUG}/admin/site`, { waitUntil: "networkidle" });
  check("Academy Site now says the page is designed in the Page designer", /no longer change it/.test(await ad.locator('[data-testid="designer-callout"]').innerText()));
  const rv = await newPage();
  await rv.goto(`${BASE}/a/riverside`, { waitUntil: "networkidle" });
  check("another academy's page is untouched", !(await rv.content()).includes('data-testid="designed-site"') && !/Learn with confidence/.test(await rv.locator("body").innerText()));

  // ----- history, restore, discard, take down -----
  await ad.goto(`${BASE}/a/${SLUG}/admin/designer`, { waitUntil: "networkidle" });
  check("the designer now opens on the live page", /Matches the live page/.test(await status()) && /Design live since/.test(await ad.locator('[data-testid="live-state"]').innerText()));
  check("the published version is in the history", (await ad.locator('[data-testid="version-select"] option').count()) === 2);
  await selectRow("Hero");
  await ad.fill('[data-testid="f-headline"]', "Second published headline");
  await ad.click('[data-testid="publish"]');
  await waitStatus(/Matches the live page/);
  check("a second publish is live", /Second published headline/.test((await publicHtml(visitor), await visitor.locator("body").innerText())));
  await ad.goto(`${BASE}/a/${SLUG}/admin/designer`, { waitUntil: "networkidle" });
  await openMore();
  const optionValues = await ad.locator('[data-testid="version-select"] option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
  check("two versions are kept, newest first", optionValues.length === 2);
  await ad.selectOption('[data-testid="version-select"]', optionValues[1]);
  await ad.click('[data-testid="restore-version"]');
  await waitStatus(/Draft saved/);
  await selectRow("Hero");
  check("an earlier version loads as the draft", (await ad.inputValue('[data-testid="f-headline"]')) === "Learn with confidence");
  check("…and the public page is still the latest", /Second published headline/.test((await publicHtml(visitor), await visitor.locator("body").innerText())));
  await openMore();
  await ad.click('[data-testid="discard-draft"]');
  await waitStatus(/Matches the live page/);
  await selectRow("Hero");
  check("discarding goes back to the live page", (await ad.inputValue('[data-testid="f-headline"]')) === "Second published headline");

  await openMore();
  await ad.click('[data-testid="take-down"]');
  await ad.waitForFunction(() => /original simple page/.test(document.querySelector('[data-testid="live-state"]').innerText));
  const html2 = await publicHtml(visitor);
  check("taking the design down puts the original simple page back", !html2.includes('data-testid="designed-site"') && (await visitor.locator("h1").innerText()).replace(/\s+/g, " ").trim() === originalHeadline.replace(/\s+/g, " ").trim());
  await openMore();
  await ad.click('[data-testid="reset-original"]');
  await waitStatus(/Draft saved/);
  await selectRow("Hero");
  check("'Rebuild from my current page content' starts again from the academy's own headline", (await ad.inputValue('[data-testid="f-headline"]')).replace(/\s+/g, " ").trim() === originalHeadline.replace(/\s+/g, " ").trim());

  check("no unexpected console errors", consoleProblems.filter((m) => !/Failed to load resource.*(401|403|404)/.test(m) && !/favicon/.test(m)).length === 0, consoleProblems.slice(0, 3).join(" || "));
} catch (e) {
  failures++;
  console.log("FAIL - unexpected error ::", e && e.stack ? e.stack : e);
} finally {
  await browser.close();
  fake.close();
}
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
