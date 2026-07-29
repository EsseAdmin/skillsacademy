import { getDatabase, type DatabaseConnection } from '@netlify/database';
import type { Pool, QueryResultRow } from 'pg';

// Netlify Database (managed Postgres) resolves its own connection string from
// the environment, so there is nothing to configure here.
//
// Nothing in this module may run at import time. `next build` imports every
// route module during its "Collecting page data" step, and the database
// credentials are only injected at request time — so connecting (or even
// asserting that a connection string exists) at module scope fails the build.
// Everything below is therefore resolved lazily, on first query.
let connection: DatabaseConnection | undefined;

function getConnection(): DatabaseConnection {
  connection ??= getDatabase();
  return connection;
}

/**
 * Runs a parameterised SQL query against Netlify Database.
 * The connection is opened on first use and reused afterwards.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<{ rows: T[]; rowCount: number | null }> {
  // Netlify Database hands back either the node-postgres pool or the Neon
  // serverless pool depending on the runtime; both expose the same
  // `query(text, params)` contract, so we narrow to the shared one.
  const pool = getConnection().pool as unknown as Pool;
  const result = await pool.query<T>(text, params as unknown[]);
  return { rows: result.rows, rowCount: result.rowCount };
}
