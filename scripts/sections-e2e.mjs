// Browser walk-through of "Module with sections": admin creates one (3 default sections), renames, adds a section and
// items, a learner works through it. Usage: BASE=http://localhost:4060/a/brightwave CHROMIUM_PATH=... node scripts/sections-e2e.mjs
import { chromium } from "playwright-core";
const B = process.env.BASE || "http://localhost:4060/a/brightwave";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
let fails = 0;
const ok = (n, c, d = "") => { console.log((c ? "PASS" : "FAIL") + " - " + n + (!c && d ? " :: " + d : "")); if (!c) fails++; };
async function login(page, email) {
  await page.goto(B + "/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "Password123!");
  await Promise.all([page.waitForLoadState("networkidle"), page.click("button[type=submit]")]);
}
const settle = (p) => p.waitForLoadState("networkidle");

// Which course is the learner already in?
const lp = await b.newPage();
await login(lp, "learner@brightwave.example");
const href = await lp.locator('a[href*="/learner/courses/"]').first().getAttribute("href");
const courseId = href.split("/learner/courses/")[1].split(/[?#]/)[0];

const ap = await b.newPage();
await login(ap, "admin@brightwave.example");
// 1. create from the picker, inside the course
await ap.goto(`${B}/admin/modules?courseId=${courseId}`);
await ap.getByRole("button", { name: /Add an activity or resource/ }).first().click();
const firstTile = ap.locator("[data-activity-type]").first();
ok("the picker offers 'Module with sections' first", (await firstTile.getAttribute("data-activity-type")) === "SECTIONS");
await firstTile.click();
await ap.waitForURL(/modules\/new\?type=SECTIONS/);
await ap.fill('[data-testid=sectioned-module-form] input[name=title]', "Sections E2E module");
await Promise.all([ap.waitForURL(/\/admin\/sections\/[^/]+$/), ap.click('[data-testid=sectioned-module-form] button[type=submit]')]);
const sectionsUrl = ap.url();
const titles = async (p) => (await p.locator('[data-testid=section-title]').allTextContents()).map((t) => t.trim());
ok("a new module opens with the 3 default sections", JSON.stringify(await titles(ap)) === JSON.stringify(["Training Session", "Activities", "Further Learning & Resources"]), JSON.stringify(await titles(ap)));

// 2. rename the first section
await ap.locator('[data-testid=module-section]').first().locator('[data-testid=rename-section]').click();
await ap.locator('[data-testid=module-section]').first().locator('input[name=title]').fill("Live training");
await Promise.all([settle(ap), ap.locator('[data-testid=module-section]').first().locator('form button:has-text("Save")').click()]);
await ap.waitForTimeout(600);
ok("a section can be renamed", (await titles(ap))[0] === "Live training", JSON.stringify(await titles(ap)));

// 3. add a section
await ap.fill('[data-testid=add-section-form] input[name=title]', "Case studies");
await Promise.all([settle(ap), ap.click('[data-testid=add-section-form] button[type=submit]')]);
await ap.waitForTimeout(600);
ok("a new section can be added", (await titles(ap)).includes("Case studies") && (await titles(ap)).length === 4);

// 4. add a URL item inside "Activities" via the picker
async function addUrl(sectionName, title) {
  await ap.goto(sectionsUrl);
  const sec = ap.locator(`[data-testid=module-section][data-section-title="${sectionName}"]`);
  await sec.locator('[data-testid=add-to-section]').click();
  ok(`section picker (${sectionName}) hides 'Module with sections'`, (await ap.locator('[data-activity-type=SECTIONS]').count()) === 0);
  await ap.locator('[data-activity-type=URL]').click();
  await ap.waitForURL(/modules\/new\?type=URL&sectionId=/);
  await ap.fill('input[name=title]', title);
  await ap.fill('input[name=content_url]', "https://example.org/" + encodeURIComponent(title));
  await Promise.all([ap.waitForURL(/\/admin\/sections\/[^/?]+/), ap.click('form:has(input[name=title]) button[type=submit]')]);
}
await addUrl("Activities", "Case exercise one");
await addUrl("Further Learning & Resources", "Big data reading");
await addUrl("Further Learning & Resources", "Second reading");
const inSection = async (name) => (await ap.locator(`[data-testid=module-section][data-section-title="${name}"] [data-testid=section-item]`).allTextContents()).join(" ");
ok("items appear under the section they were added to", (await inSection("Activities")).includes("Case exercise one") && (await inSection("Further Learning & Resources")).includes("Second reading") && !(await inSection("Live training")).includes("exercise"));

// 5. library shows one card with counts, not the items
await ap.goto(`${B}/admin/modules`);
const pageText = await ap.locator("main").innerText();
ok("the library shows the module with its counts and no separate item cards", /4 sections · 3 items/.test(pageText) && !pageText.includes("Big data reading"), pageText.slice(0, 200));

// 6. staff course page offers 'Manage sections'
await ap.goto(`${B}/admin/courses/${courseId}`);
ok("the course page links to Manage sections", (await ap.locator('[data-testid=course-manage-sections]').count()) >= 1);

// 7. learner works through it
await lp.goto(`${B}/learner/courses/${courseId}`);
const card = lp.locator('[data-testid=sectioned-module]', { hasText: "Sections E2E module" });
ok("the learner sees the module with its non-empty sections (2 of 4)", (await card.count()) === 1 && (await card.locator('[data-testid=learner-section]').count()) === 2);
ok("sections show their items", (await card.locator('[data-testid=learner-item]').count()) === 3);
ok("a section can be collapsed (details element)", await card.locator('[data-testid=learner-section]').first().evaluate((el) => el.tagName === "DETAILS"));
async function completeNext() {
  const btn = lp.locator('[data-testid=sectioned-module]', { hasText: "Sections E2E module" }).locator('[data-testid=learner-item] button:has-text("Mark")').first();
  await Promise.all([lp.waitForLoadState("networkidle"), btn.click()]);
  await lp.waitForTimeout(500);
}
const progress = async () => (await lp.locator('[data-testid=sectioned-module]', { hasText: "Sections E2E module" }).locator('[data-testid=sectioned-progress]').innerText()).trim();
await completeNext();
ok("progress shows 1 / 3", (await progress()) === "1 / 3", await progress());
await completeNext();
await completeNext();
ok("progress shows 3 / 3", (await progress()) === "3 / 3", await progress());
ok("finishing every item completes the module", (await lp.locator('[data-testid=sectioned-module]', { hasText: "Sections E2E module" }).locator('> div').first().locator('[data-testid=item-complete]').count()) === 1);

// 8. staff can remove an item; deleting a section deletes its items
await ap.goto(sectionsUrl);
const flr = ap.locator('[data-testid=module-section][data-section-title="Further Learning & Resources"]');
const before = await flr.locator('[data-testid=section-item]').count();
await flr.locator('[data-testid=section-item]').first().locator('summary[aria-label^="Menu for"]').click();
await Promise.all([settle(ap), flr.locator('[data-testid=remove-item]').first().click()]);
await ap.waitForTimeout(800);
ok("an item can be deleted", (await flr.locator('[data-testid=section-item]').count()) === before - 1, `${before} -> ${await flr.locator('[data-testid=section-item]').count()}`);
const cs = ap.locator('[data-testid=module-section][data-section-title="Case studies"]');
await cs.locator('summary[aria-label^="Section menu"]').click();
await Promise.all([settle(ap), cs.locator('[data-testid=delete-section]').click()]);
await ap.waitForTimeout(800);
ok("a section can be deleted", !(await titles(ap)).includes("Case studies"));

// 9. another academy's admin can't open it
const rp = await b.newPage();
await rp.goto("http://localhost:4060/a/riverside/login");
await rp.fill("input[name=email]", "admin@riverside.example");
await rp.fill("input[name=password]", "Password123!");
await Promise.all([rp.waitForLoadState("networkidle"), rp.click("button[type=submit]")]);
const resp = await rp.goto(sectionsUrl.replace("brightwave", "riverside"));
ok("another academy can't open the sections screen", !(await rp.locator('[data-testid=sections-module-title]').count()));
await b.close();
process.exit(fails ? 1 : 0);
