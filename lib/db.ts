import { getDatabase } from '@netlify/database';
import type { Pool } from 'pg';

// Postgres access via Netlify Database.
//
// The connection is resolved by the Netlify runtime at request time, so it MUST
// NOT be resolved while this module is being imported: Next.js imports every
// page/route module during the build to collect its config, and no database
// connection exists at that point. Resolving eagerly here fails the build.
//
// Everything below is therefore lazy — the pool is created on first use and
// reused afterwards.

declare global {
  // eslint-disable-next-line no-var
  var __academyPgPool: Pool | undefined;
}

function createPool(): Pool {
  // On Netlify the connection is injected automatically. Locally (plain
  // `next dev`, or the standalone scripts) fall back to an explicit connection
  // string if one is present in the environment.
  const connectionString = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  const { pool } = getDatabase(connectionString ? { connectionString } : undefined);
  return pool as unknown as Pool;
}

function getPool(): Pool {
  // Cached on globalThis so hot-reload in dev doesn't exhaust connections.
  globalThis.__academyPgPool ??= createPool();
  return globalThis.__academyPgPool;
}

// Behaves exactly like a `pg.Pool` (`query`, `connect`, …) but defers creating
// the underlying pool until the first property access.
const pool = new Proxy({} as Pool, {
  get(_target, prop) {
    const real = getPool();
    const value = Reflect.get(real, prop, real);
    return typeof value === 'function' ? value.bind(real) : value;
  },
});

export default pool;
