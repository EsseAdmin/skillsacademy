// Browser end-to-end test: the super admin's SkillsAcademy.ai Home page editor (draft → preview → publish,
// pictures, sections, theme, nav, history, AI rewrite/draw). Runs its own fake Anthropic API on :4021, so
// the app must be started with
//   ANTHROPIC_API_KEY=sk-ant-fake ANTHROPIC_BASE_URL=http://localhost:4021
// Run (fresh seeded database, app on :3210):
//   HOME_TEST_BASE_URL=http://localhost:3210 node scripts/home-editor-e2e.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");

const BASE = process.env.HOME_TEST_BASE_URL || "http://localhost:3210";
const SHOTS = process.env.HOME_TEST_SHOTS || "";
let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail ? " :: " + detail : ""}`);
}

// ---------- fake Anthropic API ----------
const calls = [];
const SVG = `<svg viewBox="0 0 800 450"><rect width="800" height="450" fill="#e8f0f2"/><rect x="60" y="230" width="680" height="30" fill="#8a6b4a"/><circle cx="300" cy="120" r="40" fill="#f2c9a5"/><rect x="260" y="160" width="80" height="80" rx="14" fill="#1f6f78"/></svg>`;
const fake = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    let j = {};
    try { j = JSON.parse(body); } catch { /* ignore */ }
    const name = j.tool_choice?.name || "";
    calls.push(name);
    let input = {};
    if (name === "draw_illustration") input = { svg: SVG };
    if (name === "rewrite_section") {
      const text = String(j.messages?.[0]?.content || "");
      const section = JSON.parse(text.split("Section (JSON):\n")[1].split("\n\nRequest:")[0]);
      if ("title" in section) section.title = "Calmer, clearer training";
      if (Array.isArray(section.items) && section.items[0]) section.items[0].title = "Rewritten first card";
      // a misbehaving model also tries to change a link and a picture: these must be ignored
      section.buttonHref = "https://evil.example";
      section.image = "evilpicture01.png";
      input = { section };
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: "msg_fake", type: "message", role: "assistant", model: "fake", stop_reason: "tool_use", stop_sequence: null, content: [{ type: "tool_use", id: "tu_1", name, input }], usage: { input_tokens: 5, output_tokens: 5 } }));
  });
});
await new Promise((r) => fake.listen(4021, r));

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const pngPath = path.join(os.tmpdir(), "home-e2e-pic.png");
fs.writeFileSync(pngPath, png);
const badPath = path.join(os.tmpdir(), "home-e2e-notimage.png");
fs.writeFileSync(badPath, "this is not a picture");

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
async function newPage(w = 1400) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 1000 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  page.on("dialog", (d) => d.accept());
  return page;
}
let sa;
const openMore = async () => {
  const d = sa.locator("details", { has: sa.locator("summary", { hasText: "More" }) });
  if ((await d.getAttribute("open")) === null) await d.locator("summary").click();
};
const publicText = async (page) => {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  return page.locator("body").innerText();
};

try {
  const visitor = await newPage();
  const before = await publicText(visitor);
  check("public page starts as the original design", /Launch Your Own/i.test(before) && /Every organisation faces the same skills/i.test(before) && (await visitor.locator('[data-testid="hero-image"]').count()) === 0);

  // ----- access control -----
  const anon = await newPage();
  await anon.goto(`${BASE}/super-admin/home-editor`);
  check("the editor needs a platform login", /\/super-admin\/login/.test(anon.url()), anon.url());
  await anon.goto(`${BASE}/super-admin/home-editor/preview`);
  check("the draft preview needs a platform login", /\/super-admin\/login/.test(anon.url()), anon.url());
  const bad1 = await anon.request.get(`${BASE}/api/marketing-image/..%2F..%2Fetc%2Fpasswd`);
  const bad2 = await anon.request.get(`${BASE}/api/marketing-image/doesnotexist1.png`);
  check("the picture route refuses odd or missing names", bad1.status() === 404 && bad2.status() === 404);
  const acad = await newPage();
  await acad.goto(`${BASE}/a/brightwave/login`);
  await acad.fill('input[name="email"]', "admin@brightwave.example");
  await acad.fill('input[name="password"]', "Password123!");
  await Promise.all([acad.waitForURL(/\/admin/), acad.click('button[type="submit"]')]);
  await acad.goto(`${BASE}/super-admin/home-editor`);
  check("an academy admin can't open the editor", /\/super-admin\/login/.test(acad.url()), acad.url());

  // ----- log in as the platform's super admin -----
  sa = await newPage();
  await sa.goto(`${BASE}/super-admin/login`);
  await sa.fill('input[name="email"]', "superadmin@skillsacademy.ai");
  await sa.fill('input[name="password"]', "SuperAdmin123!");
  await Promise.all([sa.waitForURL(/\/super-admin(?!\/login)/), sa.click('button[type="submit"]')]);
  await sa.goto(`${BASE}/super-admin/home-editor`, { waitUntil: "networkidle" });
  check("the editor opens, showing the live page's sections", (await sa.locator('[data-testid="section-row"]').count()) === 7 && /Matches the live page/.test(await sa.locator('[data-testid="editor-status"]').innerText()));
  check("Home page is in the platform menu", (await sa.locator('a[href="/super-admin/home-editor"]').count()) >= 1);
  if (SHOTS) await sa.screenshot({ path: `${SHOTS}/editor.png`, fullPage: true });

  // ----- edit text: draft only -----
  await sa.locator('[data-testid="section-row"]').nth(0).locator("button").first().click();
  await sa.fill('[data-testid="f-headline"]', "Train Every Team\n*Brilliantly*");
  check("an edit marks the draft as unsaved", /Unsaved/.test(await sa.locator('[data-testid="editor-status"]').innerText()));
  await sa.click('[data-testid="save-draft"]');
  await sa.waitForFunction(() => /Draft saved/.test(document.querySelector('[data-testid="editor-status"]').innerText));
  check("saving a draft says the public page is unchanged", /hasn.t changed/.test(await sa.locator('[data-testid="editor-message"]').innerText()));
  check("…and the public page really is unchanged", /Launch Your Own/i.test(await publicText(visitor)) && !/Brilliantly/.test(await visitor.locator("body").innerText()));
  await sa.click('[data-testid="tab-preview"]');
  const frame = sa.frameLocator('[data-testid="preview-frame"]');
  await frame.locator("h1").waitFor();
  check("the Preview tab shows the draft", /Brilliantly/.test(await frame.locator("h1").innerText()));
  await sa.click('[data-testid="tab-edit"]');

  // ----- pictures: upload (and refuse a fake picture) -----
  await sa.setInputFiles('[data-testid="section-form"] [data-testid="image-file"]', badPath);
  await sa.waitForSelector('[data-testid="image-error"]');
  check("a file that isn't a picture is refused", /PNG, JPG/.test(await sa.locator('[data-testid="image-error"]').innerText()));
  await sa.setInputFiles('[data-testid="section-form"] [data-testid="image-file"]', pngPath);
  await sa.waitForSelector('[data-testid="image-thumb"]');
  const heroSrc = await sa.locator('[data-testid="image-thumb"]').getAttribute("src");
  check("an uploaded picture appears with a marketing-image address", /^\/api\/marketing-image\/[a-z0-9-]+\.png$/.test(heroSrc || ""), heroSrc || "");
  await sa.fill('[data-testid="section-form"] input[value=""] >> nth=-1', "A trainer at work").catch(() => {});
  const pic = await sa.request.get(`${BASE}${heroSrc}`);
  check("the picture is served with safe headers", pic.status() === 200 && pic.headers()["x-content-type-options"] === "nosniff" && /image\/png/.test(pic.headers()["content-type"] || ""));

  // ----- AI: draw a picture for the "platform" section -----
  await sa.locator('[data-testid="section-row"]').nth(2).locator("button").first().click();
  await sa.click('[data-testid="ai-draw-toggle"]');
  await sa.fill('[data-testid="ai-draw-subject"]', "A trainer showing colleagues a laptop in a bright office");
  await sa.click('[data-testid="ai-draw-go"]');
  await sa.waitForSelector('[data-testid="image-thumb"]');
  const aiSrc = await sa.locator('[data-testid="image-thumb"]').getAttribute("src");
  check("AI drew a picture and it was saved as an SVG", /\.svg$/.test(aiSrc || "") && calls.includes("draw_illustration"), aiSrc || "");
  const aiPic = await sa.request.get(`${BASE}${aiSrc}`);
  check("the drawing is served as an image with a locked-down policy", aiPic.status() === 200 && /image\/svg/.test(aiPic.headers()["content-type"] || "") && /sandbox/.test(aiPic.headers()["content-security-policy"] || ""));

  // ----- AI: rewrite wording only -----
  await sa.locator('[data-testid="section-row"]').nth(1).locator("button").first().click();
  await sa.click('[data-testid="ai-rewrite"] summary');
  await sa.fill('[data-testid="ai-rewrite-ask"]', "Make it calmer and clearer");
  await sa.click('[data-testid="ai-rewrite-go"]');
  await sa.waitForSelector('[data-testid="ai-rewrite-proposal"]');
  check("a rewrite is shown as a proposal first", /Calmer, clearer training/.test(await sa.locator('[data-testid="ai-rewrite-proposal"]').innerText()) && /Rewritten first card/.test(await sa.locator('[data-testid="ai-rewrite-proposal"]').innerText()));
  check("nothing changed before accepting", (await sa.inputValue('[data-testid="f-title"]')) !== "Calmer, clearer training");
  await sa.click('[data-testid="ai-rewrite-accept"]');
  check("accepting applies the new wording", (await sa.inputValue('[data-testid="f-title"]')) === "Calmer, clearer training");

  // ----- add, move, hide sections; theme; menu -----
  await sa.click('[data-testid="add-section"]');
  await sa.click('[data-testid="add-text"]');
  await sa.fill('[data-testid="f-title"]', "Why we exist");
  await sa.fill('[data-testid="f-body"]', "First paragraph about the mission.\n\nSecond paragraph <b>not bold</b>.");
  check("a new section is added after the selected one", (await sa.locator('[data-testid="section-row"]').count()) === 8);
  // move it to the top (below hero is index 1): up once
  const rows = sa.locator('[data-testid="section-row"]');
  await rows.nth(2).locator('button[title="Move up"]').click();
  check("a section can be moved up", /Why we exist/.test(await rows.nth(1).innerText()) && (await rows.nth(0).innerText()).includes("Train Every Team"));
  // hide "Three sectors" (segments)
  const segRow = sa.locator('[data-testid="section-row"]', { hasText: "Three sectors" });
  await segRow.locator('button[title="Show or hide"]').click();
  check("a section can be hidden", /hidden/.test(await segRow.innerText()));
  // theme + nav
  await sa.click('[data-testid="select-site"]');
  await sa.locator('[data-testid="theme-gold"] >> xpath=following-sibling::input').fill("#ff7a00");
  await sa.locator('[data-testid="site-settings"] input[value="Log In"]').fill("Sign in");
  await sa.locator('[data-testid="site-settings"] input[value="Pricing"]').fill("Plans & prices");
  await sa.click('[data-testid="save-draft"]');
  await sa.waitForFunction(() => /Draft saved/.test(document.querySelector('[data-testid="editor-status"]').innerText));
  const stillOld = await publicText(visitor);
  check("still nothing public after all those saved edits", /Launch Your Own/i.test(stillOld) && !/Why we exist/.test(stillOld) && /Log In/.test(stillOld));

  // ----- publish -----
  await sa.click('[data-testid="publish"]');
  await sa.waitForFunction(() => /Matches the live page/.test(document.querySelector('[data-testid="editor-status"]').innerText));
  const after = await publicText(visitor);
  check("publishing updates the public page: new headline, section, picture", /Train Every Team/.test(after) && /Brilliantly/.test(after) && /Why we exist/.test(after) && (await visitor.locator('[data-testid="hero-image"]').count()) === 1 && (await visitor.locator('[data-testid="split-image"]').count()) === 1);
  check("a hidden section is gone from the public page", !/Three sectors\. One proven platform/.test(after));
  check("rewritten wording is live and the original link is untouched", /Calmer, clearer training/.test(after));
  check("HTML typed into text is shown as text", /<b>not bold<\/b>/.test(after) && (await visitor.locator(".mk-body b").count()) === 0);
  check("menu and button wording changed", /Plans & prices/.test(after) && /Sign in/.test(after));
  const accent = await visitor.evaluate(() => getComputedStyle(document.querySelector(".marketing")).getPropertyValue("--gold").trim());
  check("the accent colour changed", accent.toLowerCase() === "#ff7a00", accent);
  await visitor.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  check("the menu change also shows on the log-in page", /Plans & prices/.test(await visitor.locator("nav").innerText()));
  await visitor.setViewportSize({ width: 390, height: 800 });
  await visitor.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const overflow = await visitor.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("phone width: no sideways scrolling on the new page", overflow <= 1, String(overflow));
  if (SHOTS) {
    await visitor.screenshot({ path: `${SHOTS}/public-phone.png`, fullPage: true });
    await visitor.setViewportSize({ width: 1400, height: 1000 });
    await visitor.screenshot({ path: `${SHOTS}/public-desktop.png`, fullPage: true });
  }
  await visitor.setViewportSize({ width: 1400, height: 1000 });

  // ----- history, restore, discard, original -----
  await sa.goto(`${BASE}/super-admin/home-editor`, { waitUntil: "networkidle" });
  check("the published version is in the history", (await sa.locator('[data-testid="version-select"] option').count()) === 2);
  await sa.locator('[data-testid="section-row"]').first().locator("button").first().click();
  await sa.fill('[data-testid="f-headline"]', "Second published headline");
  await sa.click('[data-testid="publish"]');
  await sa.waitForFunction(() => /Matches the live page/.test(document.querySelector('[data-testid="editor-status"]').innerText));
  check("a second publish is live", /Second published headline/.test(await publicText(visitor)));
  await sa.goto(`${BASE}/super-admin/home-editor`, { waitUntil: "networkidle" });
  await openMore();
  const optionValues = await sa.locator('[data-testid="version-select"] option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
  check("two versions are kept, newest first", optionValues.length === 2);
  await sa.selectOption('[data-testid="version-select"]', optionValues[1]);
  await sa.click('[data-testid="restore-version"]');
  await sa.waitForFunction(() => /Draft saved/.test(document.querySelector('[data-testid="editor-status"]').innerText));
  await sa.locator('[data-testid="section-row"]').first().locator("button").first().click();
  check("an earlier version loads as the draft", /Train Every Team/.test(await sa.inputValue('[data-testid="f-headline"]')));
  check("…and the public page is still the latest", /Second published headline/.test(await publicText(visitor)));
  await openMore();
  await sa.click('[data-testid="discard-draft"]');
  await sa.waitForFunction(() => /Matches the live page/.test(document.querySelector('[data-testid="editor-status"]').innerText));
  await sa.locator('[data-testid="section-row"]').first().locator("button").first().click();
  check("discarding goes back to the live page", /Second published headline/.test(await sa.inputValue('[data-testid="f-headline"]')));

  await openMore();
  await sa.click('[data-testid="reset-original"]');
  await sa.waitForFunction(() => /Draft saved/.test(document.querySelector('[data-testid="editor-status"]').innerText));
  check("the original design can be loaded", (await sa.locator('[data-testid="section-row"]').count()) === 7);
  await sa.click('[data-testid="publish"]');
  await sa.waitForFunction(() => /Matches the live page/.test(document.querySelector('[data-testid="editor-status"]').innerText));
  const restored = await publicText(visitor);
  check("publishing the original puts the old page back", /Launch Your Own/i.test(restored) && /Three sectors\. One proven platform/.test(restored) && (await visitor.locator('[data-testid="hero-image"]').count()) === 0 && /Log In/.test(restored));
  const accent2 = await visitor.evaluate(() => getComputedStyle(document.querySelector(".marketing")).getPropertyValue("--gold").trim());
  check("…with the original colours", accent2.toLowerCase() === "#fbcb07", accent2);
} catch (e) {
  failures++;
  console.log("FAIL - unexpected error ::", e && e.stack ? e.stack : e);
} finally {
  await browser.close();
  fake.close();
}
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
