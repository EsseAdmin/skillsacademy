// Applies db/schema.sql against NETLIFY_DATABASE_URL / DATABASE_URL.
// Mirrors the style of your existing scripts/smoke-test.mjs — run with:
//   node scripts/migrate-zoom-teams.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const connectionString = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('Set NETLIFY_DATABASE_URL or DATABASE_URL before running this script.');
  process.exit(1);
}

const sql = readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
const client = new pg.Client({ connectionString });

try {
  await client.connect();
  await client.query(sql);
  console.log('Zoom/Teams integration schema applied successfully.');
} catch (err) {
  console.error('Migration failed:', err);
  process.exit(1);
} finally {
  await client.end();
}
