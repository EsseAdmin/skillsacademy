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

## Deploying to production

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for a full walkthrough of deploying this app to
[Netlify](https://netlify.com), including provisioning Netlify Database + Blobs and pointing a
custom domain at it, using the included `netlify.toml`.

## Demo accounts

### Platform Super Admin

Manage every academy, edit subscription plans/pricing, and toggle platform-wide settings at
`/super-admin`.

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
all with a 14-day free trial.

## What's implemented

- **Marketing site** (`/`) — adapted from the supplied design (navy/gold, Playfair-style
  headings), with live pricing pulled from the database so changes made by the Super Admin
  show up immediately.
- **Self-serve academy signup** (`/signup`) — a 4-step wizard: organisation details → design
  template → subscription plan → admin account. Creates the tenant, the first Academy Admin,
  and starts a 14-day free trial.
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
  Admins edit a headline, tagline and about section, see a live preview of the actual public page
  underneath the form, and can Publish/Unpublish it with one click. Once published, the page is
  live at `/a/[slug]` for anyone to view (a branded hero, about section, and the academy's
  published course catalog) — enrolling still requires signing in. Unpublished academies show a
  simple "coming soon" placeholder instead of a 404.
- **Instructor portal** — create courses, create modules (text / URL / uploaded file), assign
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
