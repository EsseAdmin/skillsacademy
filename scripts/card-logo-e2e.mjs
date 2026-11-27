// Browser check: company logos on the home page's card grid. Start the app on a fresh seeded database, then:
// BASE=http://localhost:4074 CHROMIUM_PATH=... node scripts/card-logo-e2e.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
const B = process.env.BASE || "http://localhost:4074";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
let fails = 0;
const ok = (n, c, d = "") => { console.log((c ? "PASS" : "FAIL") + " - " + n + (!c && d ? " :: " + d : "")); if (!c) fails++; };
const settle = (p) => p.waitForLoadState("networkidle").then(() => p.waitForTimeout(400));

// a real 120x40 PNG "logo" (teal block)
const logo = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAHgAAAAoCAIAAAC6iKlyAAAAZElEQVR4nO3QQQkAIADAQJsY0a/xbaEwDxZg3Jhr60Lj+cEngQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtzpFKzGev6aYfwAAAABJRU5ErkJggg==", "base64");
const logoPath = path.join(os.tmpdir(), "card-logo-e2e.png");
fs.writeFileSync(logoPath, logo);
const badPath = path.join(os.tmpdir(), "card-logo-e2e-bad.png");
fs.writeFileSync(badPath, "not a picture");

const sctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
const sa = await sctx.newPage();
sa.on("dialog", (d) => d.accept()); // Publish asks for confirmation
await sa.goto(B + "/super-admin/login", { waitUntil: "networkidle" });
await sa.fill("input[name=email]", "superadmin@skillsacademy.ai");
await sa.fill("input[name=password]", "SuperAdmin123!");
await sa.click("button[type=submit]");
await sa.waitForURL((u) => !u.pathname.endsWith("/login"), { waitUntil: "commit", timeout: 15000 });
await sa.goto(B + "/super-admin/home-editor", { waitUntil: "networkidle" });

const visitor = await (await b.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
await visitor.goto(B + "/", { waitUntil: "networkidle" });
ok("before: the public cards show no logo", (await visitor.locator(".card-logo").count()) === 0);

// find the cards section
const rows = sa.locator('[data-testid="section-row"]');
const n = await rows.count();
let found = false;
for (let i = 0; i < n; i++) {
  await rows.nth(i).locator("button").first().click();
  if (await sa.locator('[data-testid="section-form"]').getByText("Cards per row").count()) { found = true; break; }
}
ok("the Cards grid section is found in the editor", found);
const form = sa.locator('[data-testid="section-form"]');
const picker = form.locator('[data-testid="logo-picker"]');
ok("every card has an optional company-logo field", (await picker.count()) >= 3 && (await form.locator('[data-testid="logo-thumb"]').count()) === 0);

// bad file refused
await picker.first().locator('[data-testid="logo-file"]').setInputFiles(badPath);
await picker.first().locator('[data-testid="logo-error"]').waitFor({ timeout: 8000 });
ok("a file that isn't a picture is refused with a message", /PNG, JPG|picture/i.test(await picker.first().locator('[data-testid="logo-error"]').innerText()));

// add a logo to card 1 only
await picker.first().locator('[data-testid="logo-file"]').setInputFiles(logoPath);
await picker.first().locator('[data-testid="logo-thumb"]').waitFor({ timeout: 8000 });
ok("the logo appears in the editor with a Remove option", (await picker.first().locator('[data-testid="logo-remove"]').count()) === 1);
await picker.first().getByPlaceholder("e.g. Acme Ltd").fill("Acme Ltd");
await sa.click('[data-testid="save-draft"]');
await sa.waitForFunction(() => /Draft saved/.test(document.querySelector('[data-testid="editor-status"]').innerText));

// draft preview shows it, public page does not yet
await sa.click('[data-testid="tab-preview"]');
const frame = sa.frameLocator('[data-testid="preview-frame"]');
await frame.locator(".card-logo").first().waitFor({ timeout: 15000 });
ok("the Preview tab shows the logo beside the icon, above the title", (await frame.locator(".card-marks").count()) === 1 && (await frame.locator(".card-marks .icon").count()) === 1 && /Acme Ltd/.test((await frame.locator(".card-logo").first().getAttribute("alt")) ?? ""));
await visitor.reload({ waitUntil: "networkidle" });
ok("…and the public page is unchanged until publish", (await visitor.locator(".card-logo").count()) === 0);

// publish
await sa.click('[data-testid="publish"]');
await sa.waitForFunction(() => /Matches the live page/.test(document.querySelector('[data-testid="editor-status"]').innerText), null, { timeout: 15000 });
await visitor.reload({ waitUntil: "networkidle" });
const img = visitor.locator(".problem-card .card-logo");
ok("after publish the public page shows exactly one card logo", (await img.count()) === 1);
const src = await img.first().getAttribute("src");
ok("it is served from our own picture route", /^\/api\/marketing-image\/[A-Za-z0-9_-]+\.png$/.test(src ?? ""), src ?? "");
const loaded = await img.first().evaluate((el) => el.complete && el.naturalWidth > 0);
ok("the picture really loads", loaded);
const sizes = await img.first().evaluate((el) => { const r = el.getBoundingClientRect(); return { h: r.height, w: r.width }; });
ok("it is sized as a small logo (max 40px high, 150px wide)", sizes.h > 0 && sizes.h <= 40.5 && sizes.w <= 150.5, JSON.stringify(sizes));
const order = await visitor.locator(".problem-card").first().evaluate((card) => {
  const marks = card.querySelector(".card-marks"); const icon = marks?.querySelector(".icon"); const logoEl = marks?.querySelector(".card-logo"); const h3 = card.querySelector("h3");
  const y = (e) => e.getBoundingClientRect().top; const x = (e) => e.getBoundingClientRect().left;
  return { sameRow: Math.abs(y(icon) - y(logoEl)) < 30, logoRightOfIcon: x(logoEl) > x(icon), aboveTitle: y(marks) < y(h3) };
});
ok("the logo sits on the icon's row, to its right, above the title", order.sameRow && order.logoRightOfIcon && order.aboveTitle, JSON.stringify(order));
const phone = await (await b.newContext({ viewport: { width: 390, height: 800 } })).newPage();
await phone.goto(B + "/", { waitUntil: "networkidle" });
ok("on a phone the page doesn't scroll sideways because of it", await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
ok("the logo is visible without being logged in (public route)", (await (await visitor.request.get(B + src)).status()) === 200);

// remove and republish
await sa.goto(B + "/super-admin/home-editor", { waitUntil: "networkidle" });
const rows2 = sa.locator('[data-testid="section-row"]');
for (let i = 0; i < (await rows2.count()); i++) {
  await rows2.nth(i).locator("button").first().click();
  if (await sa.locator('[data-testid="section-form"]').getByText("Cards per row").count()) break;
}
await sa.locator('[data-testid="section-form"] [data-testid="logo-remove"]').first().click();
await sa.click('[data-testid="publish"]');
await sa.waitForFunction(() => /Matches the live page/.test(document.querySelector('[data-testid="editor-status"]').innerText), null, { timeout: 15000 });
await visitor.reload({ waitUntil: "networkidle" });
ok("removing the logo and publishing brings the original card look back", (await visitor.locator(".card-logo").count()) === 0 && (await visitor.locator(".problem-card .icon").count()) >= 3);

await b.close();
console.log(fails ? `\n${fails} FAILED` : "\nAll passed");
process.exit(fails ? 1 : 0);
