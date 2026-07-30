# Deploying SkillsAcademy.ai to skillacademies.ai (Netlify)

This app runs on **Netlify** using two of Netlify's managed data services,
which is why the code doesn't need a persistent disk the way a plain
Node host would:

- **Netlify Database** — a managed Postgres database (provisioned via Neon
  under the hood). The app talks to it through `src/lib/db.ts`.
- **Netlify Blobs** — object storage for uploaded module files
  (Word/PDF/PPT/etc.), used through `src/lib/storage.ts`.

Both are wired up so that once the database and site are linked, no manual
connection-string configuration is needed — Netlify injects what the app
needs automatically at runtime.

Everything below that involves your Netlify account, billing, or DNS at
your domain registrar is something you do yourself — account creation and
DNS changes at a third-party registrar aren't things that can be done for
you from outside those systems. Steps marked **(Claude)** are ones I can
do directly once the Netlify connector is enabled for this chat.

## 1. Connect Netlify to this chat

In Claude's connector settings for this chat, enable the **Netlify**
connector (already linked to your Netlify account). Once it's on, I can
create the site, provision the database, set environment variables, and
trigger deploys directly — you won't need to touch the Netlify dashboard
except for the domain step below.

## 2. Push the code to GitHub *(you, or ask me to do it)*

Netlify deploys from a Git repository (it also supports drag-and-drop
deploys of a build folder, but Git-connected is what gives you automatic
redeploys on every push).

```bash
cd skillsacademy
git init                      # if this isn't already a git repo
git add .
git commit -m "Initial commit"
```

Create a new **private** repository on GitHub, then push:

```bash
git remote add origin https://github.com/<your-account>/skillsacademy.git
git branch -M main
git push -u origin main
```

## 3. Create the site and provision Netlify Database + Blobs **(Claude)**

Once the Netlify connector is enabled, I will:

1. Create a new Netlify site linked to the `skillsacademy` GitHub repo.
   Netlify reads `netlify.toml` at the project root, which points it at
   `npm run build` and the `@netlify/plugin-nextjs` build plugin — no
   manual build settings needed.
2. Provision a Netlify Database (Postgres) and link it to the site. This
   sets the `NETLIFY_DB_URL` environment variable automatically — `src/lib/db.ts`
   picks it up via `@netlify/database`'s `getConnectionString()`, so no
   `DATABASE_URL` needs to be set by hand in production.
3. Set the `AUTH_SECRET` environment variable to a freshly generated
   random value (`openssl rand -base64 32`) — this signs session cookies,
   so it must be a real secret in production rather than the dev default.
4. Netlify Blobs needs no provisioning step or environment variable at
   all — `getStore()` in `src/lib/storage.ts` resolves automatically from
   the deploy context the moment the site is live on Netlify.
5. Trigger the first deploy and confirm the build succeeds and the site
   is reachable at its `https://<site-name>.netlify.app` URL — including
   confirming the automatic first-boot database seeding (`instrumentation.ts`
   calls `ensureSeed()`) ran cleanly, log in with the demo accounts from
   `README.md`.

## 4. Point skillacademies.ai at the Netlify site

This step needs DNS access at your domain registrar, which I can't do on
your behalf.

In the Netlify dashboard, open the site → **Domain management** → **Add a
domain**, and add both:

- `skillacademies.ai` (the apex/root domain)
- `www.skillacademies.ai`

Netlify will show you the exact DNS records to add. In general, for most
DNS providers that means:

| Host | Type | Value |
|---|---|---|
| `www` | CNAME | `<site-name>.netlify.app` (Netlify shows the exact target) |
| `@` (apex) | A record, or ALIAS/ANAME, or CNAME-flattening | whatever Netlify's dashboard shows for the apex — depends on your DNS provider |

If you'd rather have Netlify manage DNS for the domain entirely (simplest
option, and what Netlify recommends), you can instead delegate the domain
to Netlify DNS by updating the nameservers at your registrar to the ones
Netlify's dashboard shows — Netlify then handles the apex/`www` records
and certificate issuance for you with no manual record-juggling.

A couple of things that trip people up:

- Set the record TTL to something short (5 minutes) while you're setting
  this up, so changes propagate quickly if you need to fix a typo.
- Netlify issues and renews a free TLS certificate automatically once it
  verifies the domain is pointed at it — no separate SSL purchase needed,
  but it can take a few minutes after DNS propagates.

DNS propagation can take anywhere from a few minutes to a few hours.

## 5. After it's live

- Log in as the seeded Super Admin (`superadmin@skillsacademy.ai`,
  see README) and change that password, or better, create a new Super
  Admin account and remove/disable the seeded one — it ships with a known
  demo password.
- Consider disabling or changing the demo academy accounts (Brightwave /
  Riverside / Northgate) if you don't want them publicly reachable at
  `skillacademies.ai/a/brightwave` etc. — the fastest way is deleting them
  from the Super Admin → Academies page. Otherwise they're harmless demo
  data.
- Netlify Database and Blobs are both managed services with their own
  usage included in Netlify's free tier (300 monthly credits) — check
  Netlify's pricing page if the academy grows enough that usage might
  exceed the free tier, since paid tiers start at $9/mo (Personal) or
  $20/mo (Pro).
- Every subsequent `git push` to the connected branch triggers an
  automatic redeploy — no manual redeploy step needed.

## Local development

Local `npm run dev` needs a Postgres instance to talk to (Netlify Database
isn't reachable from outside Netlify's own environment). Set `DATABASE_URL`
in `.env.local` to point at any Postgres you're running locally, e.g.:

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/skillsacademy_dev
```

File uploads fall back to local disk (under `./uploads`, or wherever
`UPLOAD_DIR` points) when no Netlify Blobs context is available, which is
the case for plain `npm run dev`. For full local parity including Blobs,
run `netlify dev` instead of `npm run dev` — the Netlify CLI provisions a
local Blobs emulator automatically and `src/lib/storage.ts` uses it
transparently.
