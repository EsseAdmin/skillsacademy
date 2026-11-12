// Browser check of the private portal. Start the app with SUPER_ADMIN_PATH=/owner-7k3m9x2q SUPER_ADMIN_2FA=on (no RESEND_API_KEY),
// then: BASE=http://localhost:4070 SECRET=/owner-7k3m9x2q CHROMIUM_PATH=... node scripts/portal-e2e.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
const B = process.env.BASE || "http://localhost:4070";
const S = process.env.SECRET || "/owner-7k3m9x2q";
const capture = path.join(os.tmpdir(), "skillsacademy-last-email.json");
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
let fails = 0;
const ok = (n, c, d = "") => { console.log((c ? "PASS" : "FAIL") + " - " + n + (!c && d ? " :: " + d : "")); if (!c) fails++; };
const status = async (ctx, url) => (await ctx.request.get(B + url, { maxRedirects: 0 })).status();
const readCode = () => /is (\d{6})\./.exec(JSON.parse(fs.readFileSync(capture, "utf8")).text)[1];

const ctx = await b.newContext();
const page = await ctx.newPage();

// 1. Nothing public points at the portal, and the obvious addresses say "not found".
for (const u of ["/", "/login", "/signup"]) {
  const r = await page.goto(B + u, { waitUntil: "networkidle" });
  const html = await page.content();
  ok(`${u} loads and has no link to the portal`, r.status() === 200 && !/super-admin/i.test(html) && !html.includes(S) && !/Platform Admin/.test(html));
}
for (const u of ["/super-admin", "/super-admin/login", "/super-admin/plans", "/super-admin/login/verify"]) {
  ok(`${u} is 404`, (await status(ctx, u)) === 404);
}
ok("a wrong guess is 404 too", (await status(ctx, "/owner-wrongguess")) === 404);
ok("the secret address without signing in goes to the secret sign-in page", (await ctx.request.get(B + S + "/plans", { maxRedirects: 0 })).headers()["location"]?.includes(S + "/login"));

// 2. Sign-in, step one: wrong password
try { fs.unlinkSync(capture); } catch {}
await page.goto(B + S + "/login", { waitUntil: "networkidle" });
ok("the sign-in page is at the secret address, marked noindex", /Super Admin Login/.test(await page.content()) && (await page.locator('meta[name=robots]').getAttribute("content"))?.includes("noindex"));
ok("the sign-in page has no link back to the public site", (await page.locator('a[href="/"]').count()) === 0);
await page.fill("input[name=email]", "superadmin@skillsacademy.ai");
await page.fill("input[name=password]", "wrong-password");
await page.click("button[type=submit]");
await page.getByText(/Invalid email or password/).waitFor({ timeout: 8000 }).catch(() => {});
ok("a wrong password is refused and sends no code", /Invalid email or password/.test(await page.content()) && !fs.existsSync(capture));

// 3. Right password -> code screen; the portal is still closed
try { fs.unlinkSync(capture); } catch {}
await page.fill("input[name=email]", "superadmin@skillsacademy.ai"); // the form clears after a refused attempt
await page.fill("input[name=password]", "SuperAdmin123!");
await page.click("button[type=submit]");
await page.waitForURL(/login\/verify/, { waitUntil: "commit", timeout: 10000 }).catch(async () => console.log("DEBUG", page.url(), (await page.innerText("body")).slice(-200)));
ok("password accepted -> code screen at the secret address", page.url() === B + S + "/login/verify");
ok("the code screen hides the full email", /s•+@skillsacademy\.ai/.test(await page.locator('[data-testid=sa-code-hint]').innerText()));
const r1 = await page.request.get(B + S + "/plans", { maxRedirects: 0 });
ok("with only the password step done the portal is still closed", r1.status() >= 300 && r1.status() < 400);

// 4. Wrong code, then the right one
const code = readCode();
await page.fill("[data-testid=sa-code]", code === "000000" ? "111111" : "000000");
await Promise.all([page.waitForLoadState("networkidle"), page.click("button[type=submit]")]);
await page.waitForTimeout(500);
ok("a wrong code shows tries left", /4 tries left/.test(await page.content()));
await page.fill("[data-testid=sa-code]", code.slice(0, 3) + " " + code.slice(3));
await Promise.all([page.waitForURL(new RegExp(S + "$"), { waitUntil: "commit" }), page.click("button[type=submit]")]);
ok("the right code signs in to the secret address", page.url() === B + S);
const html = await page.content();
ok("dashboard shows and every portal link uses the secret address", /Platform|Academies/.test(html) && !/href="\/super-admin/.test(html) && html.includes(`href="${S}/plans"`));
for (const sub of ["/plans", "/academies", "/home-editor", "/settings", "/health", "/payouts"]) {
  const r = await page.goto(B + S + sub, { waitUntil: "networkidle" });
  ok(`${S}${sub} opens`, r.status() === 200 && page.url() === B + S + sub);
}
await page.goto(B + S + "/health", { waitUntil: "networkidle" });
const hh = await page.locator('[data-testid=portal-security]').innerText();
ok("System check shows the security panel: secret address in use, two-step on", /secret address in use/i.test(hh) && /Two-step sign-in\s*on\b/i.test(hh), hh);
ok("signed in, /super-admin is still 404", (await status(ctx, "/super-admin/plans")) === 404 && (await status(ctx, "/super-admin")) === 404);

// 5. Home editor still works (its preview iframe uses the secret address)
await page.goto(B + S + "/home-editor", { waitUntil: "networkidle" });
await page.click('[data-testid="tab-preview"]');
await page.locator('[data-testid="preview-frame"]').waitFor();
const frames = await page.locator("iframe").evaluateAll((els) => els.map((e) => e.getAttribute("src")));
ok("home editor preview iframe points at the secret address", frames.some((s) => s && s.startsWith(S + "/home-editor/preview")), JSON.stringify(frames));

// 6. Log out lands on the secret sign-in; the session is gone
await page.getByRole("button", { name: /log ?out/i }).first().click();
await page.waitForURL(/\/login/, { waitUntil: "commit", timeout: 10000 }).catch(() => {});
ok("logging out returns to the secret sign-in page", page.url().startsWith(B + S + "/login"), page.url());
ok("then the portal is closed again", (await ctx.request.get(B + S + "/plans", { maxRedirects: 0 })).status() >= 300);

// 7. A different role cannot use it
const lp = await b.newPage();
await lp.goto(B + "/a/brightwave/login");
await lp.fill("input[name=email]", "admin@brightwave.example");
await lp.fill("input[name=password]", "Password123!");
await Promise.all([lp.waitForLoadState("networkidle"), lp.click("button[type=submit]")]);
const rr = await lp.request.get(B + S + "/plans", { maxRedirects: 0 });
ok("an academy admin's session can't open the portal", rr.status() >= 300 && rr.status() < 400);

await b.close();
console.log(fails ? `\n${fails} FAILED` : "\nAll passed");
process.exit(fails ? 1 : 0);
