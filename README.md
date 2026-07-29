# Academy Zoom & Teams Integration — Next.js / Netlify DB version

This is a rebuild of the earlier Zoom/Teams integration scaffold, this time
shaped to match your **actual** stack (confirmed from your real
`package.json`): Next.js 16 App Router, React 19, TypeScript, Tailwind 4,
Postgres via `pg`/`@netlify/database`, and `jose`/`bcryptjs` for auth. The
previous version (a standalone Express + SQLite app) was the wrong
architecture for a Netlify Functions deployment and is what caused your
recent build failures when its files landed in the repo root — see below for
how this version avoids that.

**Zero new npm dependencies.** Everything here uses packages already in your
`package.json` (`pg`, `jose`, built-in `node:crypto`) — there is nothing to
add to `dependencies`, which was the root cause of the last two deploy
failures. Do not add `express`, `better-sqlite3`, `dotenv`, or `nanoid` —
they don't belong in this app and `better-sqlite3` specifically will not
work on Netlify Functions (native module, no persistent disk).

## How to install this — please read before copying files in

Copy these folders into your existing repo **as additions**, preserving
their relative paths, alongside your existing `app/` and `lib/` folders —
do not replace anything:

```
app/api/admin/integrations/route.ts
app/api/admin/integrations/[provider]/connect/route.ts
app/api/admin/integrations/[provider]/callback/route.ts
app/api/admin/integrations/[id]/disconnect/route.ts
app/api/courses/[courseId]/modules/[moduleId]/live-sessions/route.ts
app/admin/integrations/page.tsx
app/admin/integrations/IntegrationsClient.tsx
lib/db.ts
lib/crypto.ts
lib/auth.ts
lib/integrationsService.ts
lib/providers/types.ts
lib/providers/zoom.ts
lib/providers/teams.ts
lib/providers/index.ts
netlify/database/migrations/20260729120000_add-live-sessions-and-oauth-states.sql
```

If your repo already has a `lib/db.ts` (very likely, given `pg` is already a
dependency), **don't add a second one** — instead delete the one in this
package and update the imports in `lib/integrationsService.ts` to import
your existing pool/client instead.

The schema is applied for you. Netlify runs every migration in
`netlify/database/migrations/` automatically as part of the deploy, so there
is no migration command to run by hand — and you should not run one, since
doing so would put the migration ledger out of step with the platform.

## Two things that need your input before this actually works

This was written without access to your codebase, so two integration
points are stubbed with clearly marked assumptions rather than guesses
dressed up as working code (a third, the database connection, is now
resolved — see below):

1. **`lib/auth.ts` — `requireAcademyAdmin()`.** Guessed at a `session`
   cookie holding a `jose`-signed JWT with `academyId`/`role` claims, based
   on `jose` + `bcryptjs` being existing dependencies. Replace the body with
   whatever your app already uses to identify the signed-in admin and their
   academy — every route in this feature calls this function first.

2. **`app/api/courses/[courseId]/modules/[moduleId]/live-sessions/route.ts`
   — `assertModuleBelongsToAcademy()`.** Deliberately throws a 501 until you
   fill it in. This is the check that stops one academy's admin from
   creating a live session (and spending API quota) on another academy's
   module — it needs a real query against your existing courses/modules
   tables, which this package has no visibility into.

3. **`lib/db.ts` connection string.** Resolved: the app now calls
   `getDatabase()` from `@netlify/database`, which reads the connection
   details Netlify injects at request time. There is no connection string to
   configure, and — importantly — nothing connects at module load, which is
   what previously failed the build.

## Database connection

`lib/db.ts` exposes a single `query()` helper over Netlify Database. The
connection is opened lazily on the first query, never at import time: `next
build` imports every route module while collecting page data, and the
database credentials only exist at request time, so touching the database at
module scope fails the build.

Every database-backed route (and the admin page) is marked
`export const dynamic = 'force-dynamic'` for the same reason.

## Environment variables to add

Add these in **Netlify → Site settings → Environment variables** for
production (and your local `.env.local` for dev) — nothing here overlaps
with your existing env vars:

```
INTEGRATIONS_ENCRYPTION_KEY=   # openssl rand -hex 32

ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=
ZOOM_REDIRECT_URI=https://skillacademies.ai/api/admin/integrations/zoom/callback

MS_CLIENT_ID=
MS_CLIENT_SECRET=
MS_REDIRECT_URI=https://skillacademies.ai/api/admin/integrations/teams/callback
MS_AUTHORITY=https://login.microsoftonline.com/common
```

Creating the two OAuth apps (Zoom Marketplace "General App"/OAuth, and a
multi-tenant Microsoft Entra ID app registration with
`OnlineMeetings.ReadWrite` Graph permission) still has to happen in your own
Zoom and Microsoft admin accounts — see the earlier README I sent for the
exact steps; they're unchanged by this rewrite.

## Data model (`netlify/database/migrations/`)

`academy_integrations` (encrypted tokens per academy+provider) already existed
in the database, so the migration only adds the `status` column this feature
needs and relaxes three `NOT NULL` constraints that a provider returning no
refresh token or scope would otherwise violate. `live_sessions` (one row per
scheduled meeting) and `oauth_states` (short-lived CSRF state for the OAuth
redirect round-trip) are created new.

All of it follows the conventions already in this database rather than the
ones originally guessed here: primary keys are application-generated TEXT
UUIDs, and timestamps are ISO-8601 TEXT. `live_sessions.course_id` /
`module_id` are TEXT to match `courses.id` / `modules.id`, but carry no
foreign key yet — add those once `assertModuleBelongsToAcademy()` is wired up.

Note that `modules` already carries `live_provider` / `live_join_url` /
`live_start_time` columns from an earlier single-meeting-per-module feature.
`live_sessions` deliberately does not touch them; if the two are meant to be
one feature, reconciling them is a follow-up.

## Verified before delivery

Every `.ts`/`.tsx` file here was type-checked with `tsc --noEmit` against
your actual dependency versions (`next@16.2.10`, `react@19.2.4`, `pg`,
`jose`, `typescript@5`) and compiles cleanly. That confirms the code is
syntactically and type-correct — it does not confirm the two stubbed
integration points above behave correctly, since that depends on code this
package can't see.
