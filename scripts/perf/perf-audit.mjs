// Times the main pages of an academy (wall time, number of database queries, time spent in them).
// Needs the app started with NODE_OPTIONS="--require ./scripts/perf/pg-profile.cjs" and the
// dataset from perf-seed.sql. Run: PERF_BASE_URL=http://localhost:3212 DATABASE_URL=… node scripts/perf/perf-audit.mjs
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const pg = require("pg");
const BASE = process.env.PERF_BASE_URL || "http://localhost:3212";
const LOG = process.env.PG_PROFILE_LOG || "/tmp/pg-profile.log";
const SLUG = "brightwave";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const course = (await c.query("SELECT id FROM courses WHERE title = 'Load course 3'")).rows[0].id;
const learnerCourse = (await c.query("SELECT e.course_id FROM enrollments e JOIN users u ON u.id = e.learner_id WHERE u.email = 'learner@brightwave.example' LIMIT 1")).rows[0]?.course_id;
await c.end();
const lines = () => (fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8").split("\n").filter(Boolean) : []);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
async function session(email) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  await page.goto(`${BASE}/a/${SLUG}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "Password123!");
  await Promise.all([page.waitForURL(/\/(admin|learner|instructor)/), page.click('button[type="submit"]')]);
  return page;
}
const rows = [];
async function time(page, label, url) {
  const before = lines().length;
  await page.goto(`${BASE}${url}`, { waitUntil: "load" }); // warm-up request (compiles / caches)
  const b2 = lines().length;
  const t0 = performance.now();
  await page.goto(`${BASE}${url}`, { waitUntil: "load" });
  const ms = performance.now() - t0;
  const q = lines().slice(b2).map((l) => l.split("\t"));
  const total = q.reduce((s, [t]) => s + Number(t), 0);
  const slow = q.sort((a, b) => Number(b[0]) - Number(a[0]))[0];
  rows.push({ label, ms: Math.round(ms), queries: q.length, dbms: Math.round(total), slowest: slow ? `${slow[0]}ms ${slow[1].slice(0, 70)}` : "" });
  void before;
}
const admin = await session("admin@brightwave.example");
for (const [label, url] of [
  ["admin dashboard", `/a/${SLUG}/admin`],
  ["admin courses", `/a/${SLUG}/admin/courses`],
  ["admin course (10 modules)", `/a/${SLUG}/admin/courses/${course}`],
  ["admin modules library", `/a/${SLUG}/admin/modules`],
  ["admin people (300+ users)", `/a/${SLUG}/admin/people`],
  ["admin academy site", `/a/${SLUG}/admin/site`],
  ["admin journeys", `/a/${SLUG}/admin/journeys`],
  ["admin branding", `/a/${SLUG}/admin/branding`],
  ["admin billing", `/a/${SLUG}/admin/billing`],
  ["admin page designer", `/a/${SLUG}/admin/designer`],
  ["public academy page", `/a/${SLUG}`],
  ["public course page", `/a/${SLUG}/courses/${course}`],
]) await time(admin, label, url);
const learner = await session("learner@brightwave.example");
for (const [label, url] of [
  ["learner dashboard", `/a/${SLUG}/learner`],
  ["learner catalogue", `/a/${SLUG}/learner/catalog`],
  ...(learnerCourse ? [["learner course", `/a/${SLUG}/learner/courses/${learnerCourse}`]] : []),
]) await time(learner, label, url);
await browser.close();
console.log("page".padEnd(30), "ms".padStart(6), "queries".padStart(8), "db ms".padStart(7), " slowest query");
for (const r of rows) console.log(r.label.padEnd(30), String(r.ms).padStart(6), String(r.queries).padStart(8), String(r.dbms).padStart(7), " ", r.slowest);
