import { Pool } from 'pg';

// Reuses the same Postgres connection your app already has via @netlify/database.
// CHECK: confirm the env var name Netlify DB actually injects for your project
// (commonly NETLIFY_DATABASE_URL for the @netlify/database extension; falling
// back to DATABASE_URL covers a plain Postgres/Neon connection string too).
const connectionString = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'No database connection string found. Expected NETLIFY_DATABASE_URL or DATABASE_URL to be set — ' +
      'check what your existing @netlify/database / pg usage elsewhere in this app relies on and reuse the same pool if one already exists.'
  );
}

// If the app already exports a shared pg Pool elsewhere (likely, given `pg`
// is already a dependency), prefer importing that instead of creating a
// second pool here — this is written standalone only because this file
// doesn't have visibility into the rest of the codebase.
let pool: Pool;

declare global {
  // eslint-disable-next-line no-var
  var __zoomTeamsPgPool: Pool | undefined;
}

if (process.env.NODE_ENV === 'production') {
  pool = new Pool({ connectionString });
} else {
  // avoid exhausting connections from hot-reload in dev
  if (!global.__zoomTeamsPgPool) {
    global.__zoomTeamsPgPool = new Pool({ connectionString });
  }
  pool = global.__zoomTeamsPgPool;
}

export default pool;
