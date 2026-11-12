# SkillsAcademy.ai

A full-stack, multi-tenant "Academy-as-a-Service" platform. Businesses, charities and public
sector organisations sign up on the SkillsAcademy.ai marketing site, choose a design template
and a subscription plan, and get their own branded Moodle-style training academy — with
role-based portals for **Academy Admins**, **Instructors** and **Learners**, plus a
platform-wide **Super Admin** console.

## Tech stack

- **Next.js 16** (App Router, Turbopack, Server Actions) + **React 19** + **TypeScript**
- **Tailwind CSS v4** for styling, with a small hand-written CSS theme for the marketing site
- **PostgreSQL** via the `pg` driver — in production this is **Netlify Database** (a managed
  Postgres service), picked up automatically through `@netlify/database`; for local development
  it's any Postgres instance you point `DATABASE_URL` at
- **JWT sessions in an httpOnly cookie** (via `jose` + `bcryptjs`) for login/logout — one
  session cookie carries the user's role, academy, and tenant slug
- File uploads (Word/PDF/PPT/etc.) are stored in **Netlify Blobs** in production, via
  `src/lib/storage.ts`, and streamed back through an access-controlled API route. Local
  development without the Netlify CLI falls back to local disk under `uploads/` automatically.

> **Node version:** Node.js 20+ (22 recommended — that's what `netlify.toml` pins for
> production builds). Check with `node -v`.

## Getting started

```bash
npm install
```

You'll need a Postgres database for local development — Netlify Database itself is only
reachable from Netlify's own environment. Point `DATABASE_URL` at any Postgres you have running
locally, e.g. in `.env.local`:

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/skillsacademy_dev
```

Then:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The schema and demo/seed data are created
automatically the first time the server starts (see `instrumentation.ts` → `ensureSeed()`) —
there is no separate migration step to run.

For full local parity including Netlify Blobs (rather than the local-disk fallback), run
`netlify dev` instead of `npm run dev` — the Netlify CLI provisions a local Blobs emulator
automatically.

To build and run in production mode:

```bash
npm run build
npm start
```

### Resetting the data

Demo/seed data lives in the `skillsacademy_dev` Postgres database and, for local dev without
Netlify Blobs, uploaded files in `uploads/`. To wipe the app back to a fresh demo state, drop and
recreate the database and delete the uploads folder:

```bash
psql -c "DROP DATABASE skillsacademy_dev; CREATE DATABASE skillsacademy_dev;"
rm -rf uploads
```

The next server start will recreate the schema and reseed the demo academies automatically.

### Environment variables

For local development, set `DATABASE_URL` in `.env.local` (see above) — everything else has a
working default. For production, see `.env.example` and **[DEPLOYMENT.md](./DEPLOYMENT.md)**;
in short: on Netlify, `NETLIFY_DB_URL` is injected automatically once Netlify Database is
provisioned and linked, and Netlify Blobs needs no configuration at all — you only need to set
`AUTH_SECRET` to a random value yourself.

`ANTHROPIC_API_KEY` is optional — set it to enable "Generate with AI" (see below); everything
else works identically without it.

## Deploying to production

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for a full walkthrough of deploying this app to
[Netlify](https://netlify.com), including provisioning Netlify Database + Blobs and pointing a
custom domain at it, using the included `netlify.toml`.

## Private Super Admin portal

The platform owner's console is not part of the public site: no public page links to it, and on the live site it answers
only at an address that only you know.

- **Secret address** — set the Netlify environment variable `SUPER_ADMIN_PATH` to one word of 8–64 letters, numbers, `-` or `_`
  (for example `/owner-7k3m9x2q`, make up your own) and redeploy. The portal is then at `https://skillacademies.ai/owner-7k3m9x2q`
  (bookmark it), and `/super-admin` — and any other guess — shows a plain "not found" to everybody. Pages carry `noindex`, and
  the sign-in page links nowhere public. Without the variable (local development, tests) the portal stays at `/super-admin`.
  A badly formed value is ignored (never a lock-out) and flagged on **System check → Platform Admin security**.
- **Two-step sign-in** — after the password, a 6-digit code is emailed to the Super Admin's address (valid 10 minutes, 5 tries, one use,
  a pause between emails, at most 6 per hour; only a keyed hash is stored). It needs email to work (`RESEND_API_KEY`); in production
  without that key sign-in stays password-only and System check says so, switching on by itself once email works.
- **Where the code goes** — to the Super Admin account's own email by default. To send it somewhere else (for example when the
  account email is a placeholder), set `SUPER_ADMIN_CODE_EMAIL` to the real inbox in Netlify and redeploy.
- **If you are locked out** — set `SUPER_ADMIN_2FA=off` in Netlify and redeploy to skip the code (remove it afterwards), and check
  your secret address in `SUPER_ADMIN_PATH`. `SUPER_ADMIN_2FA=on` forces the code even without an email key (tests).
- Everything inside the code builds links with `saHref()` (`lib/superAdminPath.ts`); the routes themselves still live in
  `app/super-admin/` and `proxy.ts` rewrites the secret address onto them.
- Tests: `npm run test:portal` (address helpers + code rules) and `scripts/portal-e2e.mjs` (browser, app started with
  `SUPER_ADMIN_PATH=/owner-7k3m9x2q SUPER_ADMIN_2FA=on`).

## Complimentary (free) academies — Super Admin only

Super Admin → Academies → each academy has **Make this academy free (complimentary access)**. Choose **No end date** or **Until a
date** (end of that day; must be in the future, within 10 years), add an optional private note, and press **Grant free access**.
It can be changed or removed at any time.

- While active the academy sees a green "complimentary access" banner instead of trial/payment prompts, the Billing page says
  there is nothing to pay, and the subscribe / switch-plan sections are hidden and refused server-side. The plan you set for it
  still decides its limits (courses, learners, AI), and only the Super Admin can change that plan while access is free.
- It is separate from Stripe: nothing at Stripe is created, changed or cancelled (a live paid subscription must be cancelled in
  Stripe separately — the card warns about this). When a dated period ends the academy simply falls back to its normal
  trial / subscribe state; no scheduled job is involved.
- The Super Admin overview counts these academies under **Complimentary** and leaves them out of Est. MRR and the trial figures.
- Data: `academies.is_complimentary`, `complimentary_until` (NULL = no end), `complimentary_note`, `complimentary_granted_at`;
  rules in `lib/complimentary.ts`; actions `grantComplimentary` / `revokeComplimentary` in `lib/actions/superadmin.ts` (Super Admin
  session required). Tests: `npm run test:complimentary` and `scripts/complimentary-e2e.mjs`.

## Demo accounts

### Platform Super Admin

Manage every academy, edit subscription plans/pricing, and toggle platform-wide settings at
`/super-admin` (locally) — or, on the live site, at the **secret address** you choose (see below).

- Email: `superadmin@skillsacademy.ai`
- Password: `SuperAdmin123!`

### Demo academies

Three seeded academies show off each sector and template. Every seeded user's password is
**`Password123!`**.

| Academy | Sector | URL | Admin | Instructor | Learner |
|---|---|---|---|---|---|
| Brightwave Consulting | Business | `/a/brightwave/login` | admin@brightwave.example | instructor@brightwave.example | learner@brightwave.example |
| Riverside Community Trust | Charity | `/a/riverside/login` | admin@riverside.example | instructor@riverside.example | learner@riverside.example |
| Northgate Council | Public sector | `/a/northgate/login` | admin@northgate.example | instructor@northgate.example | learner@northgate.example |

You can also create a brand new academy from scratch at `/signup` — it walks through
organisation details, a design template, a subscription plan, and creates your admin account,
all with a free trial (14 days by default — the Super Admin sets it under Subscription Plans).

## Free trial length

The trial is a per-plan setting (Super Admin → Subscription Plans → "Trial days"), with an "Apply to all
plans" box for changing every plan at once (0 = no trial). The homepage hero, stat, pricing cards and steps,
and the sign-up page all read it from the plans (`lib/trial.ts`) — nothing public hard-codes a number of
days. Plans with different lengths show a range ("7–14 day free trial"). Academies already on a trial keep
the end date they were given at sign-up.

## Cancelling and deleting an academy

An academy admin can open Billing → "Cancel subscription & delete academy". That, in order: switches off
Stripe renewals (`cancel_at_period_end`, so no further payment is ever taken — if Stripe can't confirm
this, nothing is recorded and the admin is told to retry); records the request; emails
**academyadmin@essesystems.co.uk** (always), every super admin and any addresses in the optional
`PLATFORM_ADMIN_EMAIL` env var (comma-separated) with the academy name, who cancelled, their email, the
academy's contact email, plan, learner/course counts, reason and the archive time; and sends the admin a
receipt.

**24 hours later the academy is archived automatically**: it is soft-deleted (hidden from learners and
staff, data kept, restorable from Super Admin → Academies → Deleted academies, where it is labelled
"Archived after cancellation") and any live Stripe subscription is ended. A Netlify scheduled function
(`netlify/functions/archive-cancelled.mjs`, every hour) calls `/api/cron/archive-cancelled`, which is
protected by a token derived from `AUTH_SECRET` (or `CRON_SECRET` if set). As a safety net, loading the
Super Admin dashboard/Academies page or submitting another cancellation also archives anything overdue.
Archiving sends a second email to the same people. The admin can withdraw the request before the
archive (it cancels the scheduled archive and turns billing back on); a Super Admin can also press Delete
Academy at any time, and permanent deletion stays a manual step. While a request is pending, checkout and the
billing portal are blocked, and the Stripe webhook switches renewals off again if someone resumes the
subscription elsewhere.

## Academy languages and learning journeys

**Languages.** Every academy has a language — English, French, Spanish or German — chosen on the first step of
the sign-up wizard and changeable by the academy admin under Settings → Academy language. It decides the
wording of everything *learners* see: the public home page and course pages, sign-in / register /
password-reset / verify-email pages and their error messages, the learner portal (menu, dashboard,
catalogue, certificates, enrolment, checkout, course page) and the emails sent to learners and new staff.
It is also the language the AI writes in, for sign-up and "Generate with AI" plans and every module the AI
builds (PowerPoint, Word, SCORM, video scripts, text lessons, content-agent drafts), for admins and
instructors alike. Admin and instructor screens stay in English. The message tables are in `lib/i18n/`
(`en.ts` is the source of truth; `fr.ts`, `es.ts`, `de.ts` must have exactly the same keys, which the
compiler and `npm run test:languages-journeys` both check). The French, Spanish and German texts are
machine-written first drafts: have a native speaker read them before launch. Still English in every
language: the quiz, SCORM, lesson and activity players, the trial banner, certificate PDFs, and text the
admin or instructor typed themselves.

**Pictures.** Admins and instructors can upload a picture for each course (course page → "Course page image")
and each module (Modules Library → Edit content → picture); both appear on the public site and learner
pages.

**Learning journeys.** Admins and instructors build "metro map" journeys under Learning Journeys
(`/a/[slug]/admin/journeys`, `/a/[slug]/instructor/journeys`). A journey has *pathways* (coloured lines — one
per career route or persona, e.g. "Aspiring Headteacher") and *stations* (a course, a module or a
free-form activity with an optional web link). Put stations on a pathway in order; a station on several
pathways is an interchange. The map is drawn automatically (`lib/journeyLayout.ts`) and updates live in the
builder. A new journey is a draft: use **Add to home page** on the journeys list (or tick the box in the builder and save) and it appears as "Discover your learning journey": learners
click or tap a station (or tab to it and press Enter) to see its description, the pathways it is on and a
link. A course or module station only links when that course is published, and activity links must be
http(s). Admins can edit every journey in their academy; instructors only their own and only link courses
and modules they own or teach. Tables: `learning_journeys`, `journey_lines`, `journey_stations`,
`journey_stops` (erased with the academy).

## Editing the SkillsAcademy.ai home page (Super Admin → Home page)

The platform's own public home page (`/`) is data, not code. The super admin edits it at `/super-admin/home-editor`:

- **Sections** — a list the super admin can reorder, hide, copy, delete and add to. Types: Hero, Cards grid, Text + picture/list, Columns with bullet lists, Numbered steps, Pricing (live from Subscription Plans — only its wording is editable), Picture banner, Text block and Call-to-action band. Every heading, paragraph, button label and link is editable; sections have a background tone and some a layout choice (cards per row, picture left/right, list style).
- **Pictures** — upload (PNG/JPG/GIF/WebP/SVG ≤4MB, content-sniffed) or **✨ Draw with AI** (people-and-business scene in the page's colours, SVG rebuilt through the allow-list). Pictures are stored as `marketing/<key>` and served from `/api/marketing-image/<key>` with `nosniff` and a sandbox CSP; only names the editor generated can be fetched.
- **Colours, menu, footer, search text** — the main and accent colours, the logo wording, menu links, button labels, footer text/links and the page title/description (the "Colours, menu & footer" item). The navigation and footer are shared with the sign-up and log-in pages.
- **Draft → preview → publish** — edits are saved as a private draft (`marketing_pages.draft_json`); the Preview tab shows the draft in an iframe (desktop or phone width) from `/super-admin/home-editor/preview`; nothing is public until **Publish**. Every publish is kept in `marketing_page_versions` (newest 20); an earlier version, the original built-in design, or the live page can be loaded back as the draft ("More ▾").
- **✨ AI rewrite** — per section: describe the change, review the proposed wording (old vs new), and accept or discard. A rewrite changes wording only — never links, pictures, layout, visibility or the section's id (`mergeWording`). Not metered per academy; needs `ANTHROPIC_API_KEY`.
- **Placeholders** — `{trial}`, `{trialDays}`, `{planCount}`, `{planNames}`, `{academyCount}`, `{year}` and `{{#trial}}…{{else}}…{{/trial}}` keep the page's numbers and trial wording live. The built-in content uses them, so the unedited page looks exactly as before.
- **Safety** — everything the browser or the AI sends is rebuilt by `sanitizePage()` (`lib/marketingPage.ts`): unknown section types dropped, lengths and counts clamped, links limited to `/path`, `#anchor`, `https://` and `mailto:`, picture names to the editor's own pattern, colours to `#rrggbb`. Text is always rendered as text, never HTML. All actions require the super admin session.

Tests: `npm run test:schema-race` (8 instances starting at once), `npm run test:marketing-page` (sanitiser, tokens, markup, AI wording guard, draft/publish/history) and `npm run e2e:home-editor` (browser, with a fake Anthropic server on :4021; start the app with `ANTHROPIC_API_KEY=sk-ant-fake ANTHROPIC_BASE_URL=http://localhost:4021`).

## Designing an academy's public page (Academy admin → Page designer)

Every academy admin can redesign their academy's public page (`/a/<slug>`) under **Page designer** — on every plan, including during the trial. Instructors and learners can't.

- **Sections**: the same builder as the platform home page (hero, text, picture banner, cards, text + picture/list, columns, steps, call-to-action) plus video, news posts, "what you'll learn", the **course list** and **learning journeys** as movable sections. Each can be reordered, hidden, copied, deleted and given its own background colour and `#anchor`.
- **Look**: the academy's own main/second/accent colours and page background (blank = follow the Branding template), heading and body fonts from a short list of fonts every device has, menu links and style, footer text, links and style, and a search title/description. The "Powered by SkillsAcademy.ai" line always stays.
- **Draft → preview → publish**: changes are a private draft (`academy_pages.draft_json`); the Preview tab shows it at `/a/<slug>/admin/designer/preview` (admin only). Publish makes it live and keeps the newest 20 versions (`academy_page_versions`) so one can be brought back. "Take the designed page down" returns to the original simple page.
- **Until the first publish** visitors keep seeing the original simple page. The designer's first draft is built from the academy's current headline, tagline, Academy Site sections (pictures are copied) and its courses and journeys.
- **AI help**: rewrite a section's wording (shown as a proposal; changes wording only, never links, pictures, colours or layout) and draw a picture. Both count against the academy's monthly AI allowance (`withAiMeter`).
- **Safety**: everything is rebuilt by `sanitizeAcademyPage()` (`lib/academyPage.ts`): links limited to `/path`, `#anchor`, `https://` and `mailto:`, videos to `https://`, colours to `#rrggbb`, fonts to the list, pictures to files the designer stored under the academy's own folder (`academy-pages/<academyId>/…`, served from `/api/academy-page-image/<slug>/<name>` with `nosniff` and a sandbox CSP).
- Tests: `npm run test:academy-page` (data, rendering, deletion) and `npm run e2e:academy-designer` (browser; fake Anthropic on :4022).

## Engagement analytics (Academy admin → Analytics)

Academy admins get reports on how learners use their courses and modules (`lib/analytics.ts`, pages under
`app/a/[slug]/admin/analytics`):

- **Overview & courses** - learners, active learners, new enrolments, modules completed, average progress, quiz attempts
  and pass rate, certificates, learners who have gone quiet; two trend charts (daily up to 90 days, weekly beyond) and a
  per-course table. Time range: 7 / 30 / 90 days, 12 months, all time.
- **Course drill-down** - for each module in course order, how many learners completed it (the "where do people drop off"
  bar, with the biggest drop-off flagged) plus quiz average / pass rate, and every learner in the course with progress and last activity.
- **Modules** - completion rate per module, "needs attention" first, searchable and paged.
- **Learners** - Active / Inactive / Not started / Finished, searchable and paged. *Inactive* = an unfinished course and nothing
  done for 14 days.
- **CSV export** of every report (`/a/<slug>/admin/analytics/export?report=courses|modules|learners|course:<id>`), academy admins of
  that academy only; cells that look like spreadsheet formulas are defused.
- **Weekly email** every Monday 08:00 UTC (`netlify/functions/weekly-digest.mjs` -> `/api/cron/weekly-digest`): at most one per
  academy every 6 days, can be switched off on the Analytics page, and an admin can email themselves a copy at any time.

Test: `npm run test:analytics`.

## Speed notes

Pages batch their database lookups (no query per row), the schema setup is skipped on cold starts when it is unchanged
(`schema_version` hash), and common list/foreign-key columns are indexed. `scripts/perf/` has a profiling harness
(`pg-profile.cjs`, `perf-seed.sql`, `perf-audit.mjs`). Uploads of documents and videos are limited to 4MB because Netlify caps
request bodies at about 6MB; bigger files should be linked.

## Modules with sections (Academy admin and Instructor → Modules)

"Add an activity or resource" → **Module with sections** creates a module that opens with three default sections - *Training Session*,
*Activities* and *Further Learning & Resources* (`DEFAULT_SECTION_TITLES` in `lib/queries.ts`). On **Manage sections & content**
(`/a/<slug>/{admin|instructor}/sections/<moduleId>`, `components/ModuleSectionsPage.tsx`) staff rename sections, add their own, reorder
or delete them, and use **Add an activity or resource** inside a section (the same picker, minus "Module with sections") to create
files, links, pages, videos, quizzes, SCORM, assignments, forums and so on there. Items can be edited, moved up/down, moved to another
section of the same module, or deleted.

How it's stored: `module_sections` (id, module_id, title, order_index) and three new `modules` columns - `parent_module_id`,
`section_id`, `item_order`. An item in a section is an ordinary module row (so every activity type, file download, quiz, SCORM and
grading code keeps working) that is *not* in `course_modules`: the course lists only the container. Items are hidden from the module
library, the "assign existing module" menu, module analytics and the AI agent's module list.

Rules worth knowing:
- Access (`lib/moduleAccess.ts`): a learner reaches an item when enrolled (paid/free) in a course that lists its container;
  an instructor manages an item when they manage the container; other academies can't see either.
- Completion (`lib/progress.ts`): items complete like any module; the container completes automatically when every item is complete,
  and an empty container can be marked complete by hand. Course progress and the certificate check count only the course's own
  modules (`completedCourseModules`), so items never inflate progress; analytics "module completions" and per-learner counts ignore items.
- Deleting a section deletes its items (with their stored files); deleting the module deletes everything inside it (`lib/moduleCleanup.ts`).
- Learners see the sections as collapsible groups; sections with no items are hidden. Existing modules are unchanged (no migration).
- Not covered yet: per-item analytics, dragging items between modules, and sections for the AI module builder (it still creates flat modules).
- Tests: `npm run test:sections` (26 checks) and `node scripts/sections-e2e.mjs` (browser walk-through as admin and learner).

## Help assistant (Academy admin, every admin page)

A floating **Help** button opens a chat that answers "how do I...?" and "why isn't... showing?" (`lib/aiHelp.ts`,
`lib/helpGuide.ts`, `components/HelpAgent.tsx`). It is **read-only**: it answers from a hand-written platform guide plus a small
snapshot of the academy (counts and states, no personal data) and links to the right admin page - links are chosen by name and
built by the server, never written by the model. Questions are recorded as `ai_usage` rows with source `help` but do **not** use
the plan's monthly AI allowance; they have a separate limit of 40 per academy per 24 hours. Without an `ANTHROPIC_API_KEY`
(or once the daily limit is hit, or if the model fails) it falls back to the built-in guide, so it always answers.
Set `ANTHROPIC_HELP_MODEL` to run the assistant on a cheaper/faster model than the content features. Test: `npm run test:help`.

## Course payments (payment links)

SkillsAcademy.ai **does not take payments for courses**. An academy that wants to charge does it on its own website or payment system,
and each course has two optional fields (course page → edit course): **Price shown** (£, so learners see what it costs; 0 = free) and
**Payment link** (a https page on the academy's own site, `courses.payment_url`, validated with `safeHttpUrl(..., { httpsOnly: true })`).

- A course "needs payment" when it has a price or a link (`lib/coursePayment.ts`). Learners can't self-enrol: Enrol/Buy lead to
  `/learner/checkout/<course>`, an information page with a *Go to the payment page* button (opens the academy's link in a new tab) and a
  note that the academy gives access after payment. With no link it asks the learner to contact the academy.
- After the learner pays, the academy adds them from the course page or **People**; courses with a payment get that enrolment marked paid.
- A course made free again lets any waiting learner straight in. Refunds, receipts and invoices are the academy's own business.
- The earlier Stripe Connect integration, the *Course payments* menu item, the Connect webhook and the dashboard Revenue figure have been
  removed. The platform's own subscription billing (Billing page, Stripe) is unchanged.

## Course types, levels and AI pictures

Every course belongs to one of three types; the academy home page groups its courses into one section per type (`#self-paced`, `#certification`, `#instructor-led`):

1. **Self-paced Training** (`SELF_PACED`) — the default; every course that existed before this change.
2. **Certification Pathways** (`CERTIFICATION`).
3. **Instructor-led courses and training** (`INSTRUCTOR_LED`).

- **Switching types on and off** — on the admin *and* instructor Courses page a "Course types" card has an On/Off button per type (stored in `academies.enabled_course_types`). A type that is off is hidden from the public home page, the learner catalogue and the public course page (404), and new enrolment/checkout is refused; nothing is deleted and learners who already enrolled keep access.
- **Course card** — one card (`components/CourseCard.tsx`) is used on the home page, learner catalogue and admin/instructor lists: picture with price pill, type, title, description, and `Level • N modules • H hr`. The module count is automatic; hours come from the course's own "Hours of study" field, else the sum of its modules' study minutes (an untimed module counts as 10 minutes). The public course page shows the same line plus level and minutes on each module.
- **Setting them** — Course type / Level / Hours of study are on the create and edit course forms (`?type=SELF_PACED|CERTIFICATION|INSTRUCTOR_LED` pre-selects the type). The Module Library has a "Study time (minutes)" field per module.
- **AI-designed pictures** — "Design a picture with AI" on a course page and on each module (Module Library). Claude draws an SVG (`lib/aiIllustration.ts`), it is rebuilt through an allow-list (`lib/svgSafe.ts`: no scripts, links, text, images or styles) and stored exactly like an uploaded picture. "Generate with AI" academies get a drawn cover for each new course automatically as best-effort jobs in the build queue; if a drawing fails or there is no API key the topic-matched default picture stays. Each drawing counts as one AI call against the plan's monthly allowance.
- AI-generated plans include each course's type, level and study hours. Pictures are **illustrated people and business scenes** (colleagues at a desk, a trainer with a group, a team around a laptop) rather than abstract shapes; the fast `claude-haiku-4-5` model draws them (override with `ANTHROPIC_IMAGE_MODEL`).

Tests: `npm run test:course-types` (helpers, SVG sanitiser, plan fields, picture jobs with a fake drawer) and `npm run e2e:course-types` (browser test against a running app).

## What's implemented

- **Marketing site** (`/`) — adapted from the supplied design (navy/gold, Playfair-style
  headings), with live pricing pulled from the database so changes made by the Super Admin
  show up immediately.
- **Self-serve academy signup** (`/signup`) — a 4-step wizard: organisation details → design
  template → subscription plan → admin account. Creates the tenant, the first Academy Admin,
  and starts the free trial. Step 1 has an optional "Describe your academy" AI panel
  (requires `ANTHROPIC_API_KEY` — hidden entirely if it isn't set) that turns a sentence or two
  into a draft name, colour theme, headline, tagline and a starter list of **courses** (never modules)
  for the admin to review before continuing through the same steps as a manual signup. The last step
  also takes an optional **company logo** (PNG/JPG/GIF/WebP/SVG, ≤2MB) that is shown on the academy page.
- **Content agent** (`/a/[slug]/admin/content-agent` and `/a/[slug]/instructor/content-agent`) —
  one prompt box for admins and instructors: say which course and which modules, in which
  format ("a PowerPoint on evacuation procedures with an exercise sheet, a SCORM quiz and a Word
  handout on giving feedback"). The agent plans the request (`lib/contentAgent.ts`, tool
  `plan_modules`), then **creates the modules straight away** — no review step — as ordinary
  modules in the chosen course: PowerPoint (`.pptx`, optional companion Word exercise sheet), Word
  (`.docx`), SCORM 1.2 lesson with a self-check quiz, video script, or a full written lesson. All
  content is meant to be usable as it stands: these builds are **strict** — complete AI-written
  content or nothing; there are no placeholder drafts. If a file can't be written the module is not
  added, the progress panel says why and offers **Try again**. If the course or request is unclear the
  agent asks one question instead of guessing. Web links are never invented: a link module needs an
  address typed in the request. The plan is re-validated server-side: allowed courses only
  (instructors: courses they created or teach), at most 8 generated files per request
  (`MAX_AGENT_COST`). The files are built one short step at a time in the browser-driven build queue
  (`lib/aiBuildJobs.ts`), each with a drawn picture. Every AI call is counted per academy per calendar
  month against a **plan cap** (`subscription_plans.ai_monthly_limit`, editable in Super Admin →
  Subscription Plans; blank uses the defaults 30 / 150 / 600 for starter / growth / enterprise, 50 for
  any other plan). The older "improve this module" review queue (drafts, Approve / Reject / Restore)
  remains on the same page for existing drafts. Usage shows on the agent page and, per academy, in Super
  Admin → Academies. Tests: `npm run test:content-agent`, `npm run e2e:content-agent`, `npm run test:ai-agent`.
- **Activities and resources** (Module Library → “+ Add an activity or resource”) — a Moodle-style
  picker (search, All / Activities / Resources / Starred tabs, favourites) for admins and instructors.
  Besides the existing Text, URL, File, Video, Live session, Quiz and SCORM it adds **Page** (headings,
  lists, bold, links), **Book** (chapters), **Folder** (several files), **Text and media area** (image,
  audio or video inline), **Assignment** (text and/or file hand-in; the instructor grades it and can
  reopen it), **Choice** (poll with optional results), **Forum** (topics and replies; staff can hide
  posts), **Glossary** (searchable terms) and **Lesson** (pages with questions checked on the server).
  Activities complete a learner's module when they hand in / vote / post / finish; resources use
  “Mark complete”. Everything is scoped to the academy in the session, and instructors only manage
  modules they created, are assigned to, or that sit in a course they teach. Uploads are limited to
  5MB per save and an allow-list of file types. Tests: `npm run test:activities`.
- **Generate with AI** (`/a/[slug]/admin/ai-generate`) — the same AI generator, available any
  time to an existing academy's admin. Describes a colour theme and/or courses in plain language,
  previews the result, and — only on explicit approval — adds a new custom colour template (optionally
  switching to it) and **new courses only** (title, description, type, level, hours and a drawn cover
  picture). It never writes modules, lessons, About text or homepage sections: the admin or instructors
  add modules by hand or with the Content agent. Never deletes or overwrites anything already there.
- **System check (Super Admin → System check)** — shows whether email and card payments are really
  working, without needing hosting logs: whether `RESEND_API_KEY` is set, whether the sender domain
  is verified in Resend, a **Send a test email** button (to your own address, showing Resend's exact
  answer), Stripe's own view of the account (can it take payments, what it still needs), every plan's
  price with a warning for anything under Stripe's **30p minimum**, a **Test checkout** button per
  plan that shows Stripe's exact refusal, and a rolling log of recent email/Stripe successes and
  failures (`integration_events`). Plans priced between 1p and 29p are refused in Subscription Plans
  because Stripe can't charge them and every checkout for them would fail.
- **AI-generated rich module content** (now produced by the Content agent, not by plan generation) — each module is given a format, and
  the agent builds real content for it (`src/lib/aiModuleBuild.ts`): **PowerPoint**
  (AI-written slides with speaker notes -> a genuine `.pptx`, `src/lib/generators/pptx.ts`),
  **Word** (a lesson handout -> a genuine `.docx`), **SCORM** (a short interactive lesson with a
  self-check quiz -> a valid SCORM 1.2 package that runs in the built-in player and reports
  pass/complete like any uploaded package), **video** and **web links**. Ask for formats in the
  prompt ("a PowerPoint for each lesson, a Word handout, one interactive SCORM lesson") or let the
  AI pick. The AI can't make video, so a video module comes with a drafted script and the admin
  adds the real video (YouTube/Vimeo/`.mp4` link or a small upload) via Edit content. Links are
  **never invented**: a URL/video module only gets a link if the admin typed that exact address
  in their request; otherwise it's created empty, ready for a link to be pasted in. Generated
  files are ordinary modules afterwards — download them, edit them in Office, upload replacements.
  **By default every module is a PowerPoint deck, and each deck also gets a companion Word
  "Exercises" document** (4-6 practical activities plus a reflection, added as a second module
  right after it, e.g. "Grip and stance" then "Grip and stance — Exercises"). Both files are
  written by parallel AI calls, so a module takes about as long as one call. A plan is limited to
  8 AI-built files (`MAX_RICH_MODULES`), i.e. 4 modules with both a deck and exercises — the
  outline prompt asks for at most 4 modules; any beyond the cap, or anything that fails/times
  out, falls back to a clearly-marked text draft (a failed exercises sheet is simply skipped)
  rather than failing the whole plan. Run the dashboard's Generate with AI tool again to add more.
- **Video modules** — a new `VIDEO` module type: paste a YouTube, Vimeo or direct `.mp4/.webm`
  link (embed URLs are rebuilt from the validated video id, `src/lib/videoModule.ts`), or upload
  a small file (4MB max — Netlify's request-size limit) that plays inline with HTTP Range
  support. Anything bigger should be hosted on YouTube/Vimeo and linked.
- **Multi-tenant routing** — every academy lives under `/a/[slug]/...`; a `proxy.ts`
  (Next.js 16's renamed `middleware.ts`) guards `admin`/`instructor`/`learner` routes based on
  the signed session cookie.
- **Design templates** — 5 seeded templates (colour palette + typographic style); Academy
  Admins can switch templates any time from Branding, and the whole portal re-themes via CSS
  variables.
- **Academy Admin portal** — dashboard, course management, people management (add/suspend/
  remove instructors & learners, with plan-based seat limits enforced), branding, billing, and
  academy settings.
- **Academy Site** (`/a/[slug]/admin/site`) — a visual editor for the academy's public homepage.
  The homepage is deliberately minimal: the **headline**, the **tagline** and the published
  **courses** (one section per course type, each course a card with picture, level • modules • hours, and
  price). Nothing else appears by default. The business **logo** (PNG/JPG/GIF/WebP/SVG, ≤2MB) can be
  uploaded at sign-up or here; it shows in the header on a white chip and is served from
  `/api/academy-logo/[slug]`. Anything more is an optional **section** the admin adds under "Homepage
  content → Add a section" and orders with the arrows: **Text** (e.g. About us), **What you'll learn**
  (check-marked points, one per line), **Image**, **Video** and **News**; sections can be hidden and
  shown again. Academies that already had an About text or "What you'll learn" points keep them as
  *hidden* sections (one-time migration, `academies.home_sections_migrated`), so nothing is lost and
  nothing reappears unasked. Learning journeys are shown on the page only for academies that publish
  one. No contact email is shown anywhere on the page. A live preview sits under the form and the page
  can be Published/Unpublished with one click; unpublished academies show a simple "coming soon"
  placeholder instead of a 404. Tests: `npm run test:home-migration`, `npm run e2e:content-agent`.
- **Pictures for courses and modules** — admins and instructors can upload a picture for any course
  (course edit page) and any module (Modules page → Edit content → Module picture); PNG/JPG/GIF/WebP/SVG,
  ≤3MB, content-sniffed, served from `/api/courses/[id]/cover` and `/api/modules/[id]/image` (public only
  for published courses of a published academy). With no picture (and no emoji chosen) a default
  illustration matched to the title/category is shown instead — psychology → brain, counselling/leadership →
  conversation, business → chart, code, health, law/compliance, science, language, else a graduation cap
  (`lib/courseArt.ts` picks, `components/CourseArt.tsx` draws them in the academy's colours).
- **Course page** (`/a/[slug]/courses/[id]`) — a hero with breadcrumb, title, description, a cover image
  (optional; uploaded on the course edit page along with a free-text "Estimated" time) and two buttons:
  **Start Learning** and **Enrol**. For a signed-in learner: Start Learning opens the course (enrolling
  them first if needed; paid courses go to checkout) and Enrol enrols / goes to checkout (shows
  "✓ Enrolled" once done). Visitors are sent to sign in (Start Learning) or create an account (Enrol)
  and returned to the course afterwards via a validated `?next=` (see `lib/nextPath.ts`).
- **Instructor portal** — create courses, create modules (text / URL / video / uploaded file / SCORM), assign
  modules to one or more courses, add learners, and enrol them directly.
- **Course & module assignment** — academy admins and instructors can assign learners directly
  to a course (from the course page, the instructor's Learners page, or the admin People page),
  and can designate which instructor(s) are teaching a course or own a given module (from the
  course page, the Module Library, or the admin People page). Instructor assignment is
  organisational/reporting only — every instructor in an academy keeps full access to all of
  that academy's courses and modules regardless of assignment.
- **Learner portal** — browse the course catalog, enrol in free courses, buy paid courses
  through a simulated checkout, view/download module content, and mark modules complete
  (with a per-course progress bar).
- **Course & module model** — a course has many modules (via a join table, so a module can be
  reused across courses); each module is TEXT, URL, or an uploaded FILE (Word, PDF, PPT,
  or any document type).
- **Payments** — academy subscription billing runs through **real Stripe Checkout**
  (`src/lib/actions/billing.ts`): academy admins pay by card via Stripe's own hosted checkout
  page, subscription status and invoices update automatically via a signed webhook
  (`src/app/api/webhooks/stripe/route.ts`), and admins can update their card or view invoices
  through Stripe's Billing Portal. Money collected goes into the platform owner's own Stripe
  balance and pays out to their real business bank account on whatever schedule (e.g. monthly)
  is set in the Stripe Dashboard — see `DEPLOYMENT.md` and the Super Admin → Payouts page. This
  app never asks for or stores card numbers or bank account details itself. Without a
  `STRIPE_SECRET_KEY` configured, billing surfaces show a clear "not set up yet" message
  instead of erroring, which is the state this ships in by default. Course purchases
  (`src/lib/actions/learning.ts#checkoutCourse`) still use a **simulated** checkout (any
  card number/expiry/CVC in the right shape "succeeds") rather than real Stripe — the data
  model already supports wiring that up the same way if needed later.
- **Super Admin console** (`/super-admin`) — platform-wide dashboard (MRR estimate, trials
  ending soon), full academy list with delete/restore and inline plan/template/status editing,
  full CRUD on subscription plans (pricing, trial length, seat limits, feature bullets shown
  on the marketing site), and platform feature toggles. Deleting an academy is a soft delete —
  it disappears from the main list and from learners/admins but stays recoverable in a
  collapsed "Deleted academies" section, where it can either be restored or erased for good
  ("Delete Permanently", only offered on already-deleted academies, with an in-browser
  confirmation first) — permanent deletion removes the academy and everything it owns
  (courses, modules, enrollments, users, payments, etc.) from the database for good.
- **Auth** — every role (Super Admin, Academy Admin, Instructor, Learner) has its own login
  and logout, backed by bcrypt-hashed passwords and a signed JWT session cookie. Every new
  account, at every entry point (academy signup, an admin adding an instructor/learner, a
  learner self-registering), has its email address checked for a real, deliverable-looking
  domain via a DNS mail-record lookup (`src/lib/emailValidation.ts`) — not just a format regex
  — so obviously fake or mistyped addresses are rejected before an account is ever created.
  "Forgot your password?" on the login page works the same way for every role — Academy Admin,
  Instructor, and Learner all share one tenant login page and one reset-link flow
  (`src/lib/actions/passwordReset.ts`). When an academy admin adds a new instructor or learner
  from the People page, they can either email that person a "set your password" link (the
  default) or set the person's initial password themselves right there on the form, to hand
  over directly instead.
- **Email verification** — every new tenant account, at every entry point (an academy admin at
  signup, an admin adding an instructor/learner, a learner self-registering), is emailed a
  confirmation link. Clicking it is optional, not a login gate — it isn't checked anywhere in
  the login flow (`src/lib/actions/auth.ts#tenantLogin`, `src/lib/emailVerification.ts`), so
  everyone can log in (and is logged straight in at signup/registration) regardless of whether
  they've verified. Clicking a "set your password" welcome link (above) or a "reset your
  password" link also counts as verifying, since it already proves the person controls the
  inbox — only an admin-set-password account (where nothing else is emailed) gets a dedicated
  verification-only email. The link logs the person straight into their portal on success
  (`/a/[slug]/verify-email/confirm`), and anyone can request a fresh one from
  `/a/[slug]/verify-email`. Accounts that already existed before this feature shipped are
  grandfathered in as verified automatically (see the migration comment in `src/lib/db.ts`), and
  seeded demo accounts are pre-verified the same way — though none of that matters for logging
  in any more, since verification is purely optional now. This uses the same
  `RESEND_API_KEY`-backed email sending as password reset, so it's worth confirming that's set
  in production (see DEPLOYMENT.md) for the verification and password-reset/welcome emails to
  actually go out — without it, those emails only ever appear in server logs, but nobody is
  blocked from using the app either way.

## Project structure

```
src/
  app/
    (marketing)/         # Public marketing site + signup wizard (shares navy/gold theme)
    a/[slug]/             # Tenant-scoped routes: login, admin/*, instructor/*, learner/*
    super-admin/          # Platform admin console
    api/files/[moduleId]/ # Access-controlled file download endpoint
  components/              # Shared UI: PortalShell, forms, course/module views
  lib/
    db.ts                  # Postgres connection pool (pg) + schema, Netlify Database aware
    storage.ts               # File storage: Netlify Blobs in production, local-disk fallback for dev
    queries.ts              # Typed async data-access layer (no ORM)
    seed.ts                  # Idempotent demo-data seeding
    auth.ts / authz.ts        # Session cookies + route/role guards
    actions/                   # All Server Actions (mutations), grouped by feature
```

## Known limitations (by design, given the brief)

- Course purchases (as opposed to academy subscription billing, which is real Stripe) are
  still simulated, not wired to a real processor — see above.
- Netlify Database and Netlify Blobs are both managed services with usage limits on the free
  tier (300 monthly credits) — see `DEPLOYMENT.md` for what to watch as the academy grows.
- AI-generated PowerPoint/Word/SCORM content is a solid first draft written from a short module
  outline, not a substitute for subject-matter review — check facts (especially anything
  regulatory or safety-related) before publishing. Generated SCORM is a simple single-SCO
  lesson + multiple-choice check, not an Articulate-style authored course. Text modules from a
  plan are still outlines only.
- Netlify cuts any request off at about 30 seconds, so AI content is built in steps: applying
  a plan saves the theme/homepage/courses at once and queues every module (`ai_build_jobs`);
  the admin's browser then builds one module per short request (`components/PlanBuildProgress`,
  `lib/aiBuildJobs.ts`) with a progress bar, also after sign-up. Closing the page pauses it and
  it resumes on the dashboard. A module whose AI call doesn't fit its step becomes a text draft
  (the admin is told how many); failed modules can be retried from the progress card.
- Direct video uploads are capped at 4MB (serverless request limit); use a YouTube/Vimeo/`.mp4`
  link for real videos.
