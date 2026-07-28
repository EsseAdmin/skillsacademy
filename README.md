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
db/schema.sql
scripts/migrate-zoom-teams.mjs
```

If your repo already has a `lib/db.ts` (very likely, given `pg` is already a
dependency), **don't add a second one** — instead delete the one in this
package and update the imports in `lib/integrationsService.ts` to import
your existing pool/client instead.

Before running or deploying, apply the schema:

```
node scripts/migrate-zoom-teams.mjs
```

## Three things that need your input before this actually works

This was written without access to your codebase, so three integration
points are stubbed with clearly marked assumptions rather than guesses
dressed up as working code:

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

3. **`lib/db.ts` connection string.** Set to try `NETLIFY_DATABASE_URL` then
   `DATABASE_URL`. Confirm which one your `@netlify/database` setup actually
   uses (check your Netlify environment variables or wherever your existing
   `pg` usage reads its connection string from) and align this.

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

## Data model (`db/schema.sql`)

Three new, additive tables — `academy_integrations` (encrypted tokens per
academy+provider), `live_sessions` (one row per scheduled meeting), and
`oauth_states` (short-lived CSRF state for the OAuth redirect round-trip).
`live_sessions.course_id`/`module_id` are plain integers with no foreign key
to your real tables, since this package doesn't know their actual column
types — fix those types and add the FK once you wire this in for real.

## Verified before delivery

Every `.ts`/`.tsx` file here was type-checked with `tsc --noEmit` against
your actual dependency versions (`next@16.2.10`, `react@19.2.4`, `pg`,
`jose`, `typescript@5`) and compiles cleanly. That confirms the code is
syntactically and type-correct — it does not confirm the two stubbed
integration points above behave correctly, since that depends on code this
package can't see.
