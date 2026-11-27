// Regression test: several function instances starting at once (a fresh deploy) must not
// fail with "duplicate key value violates unique constraint pg_type_typname_nsp_index".
// Child mode: DATABASE_URL=… npx tsx scripts/schema-race-test.ts child
// Parent mode: DATABASE_URL=postgres://…/<existing empty db> npx tsx scripts/schema-race-test.ts
import { spawn } from "node:child_process";
import { ensureSchema, pool } from "../lib/db";

async function child() {
  try {
    await ensureSchema();
    await pool.end();
    process.exit(0);
  } catch (e) {
    console.error("CHILD FAILED:", (e as Error).message);
    process.exit(1);
  }
}

async function parent() {
  const N = 8;
  const runs = Array.from({ length: N }, () => new Promise<{ code: number; err: string }>((resolve) => {
    const p = spawn(process.execPath, ["--import", "tsx", __filename, "child"], { env: process.env });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => resolve({ code: code ?? 1, err }));
  }));
  const results = await Promise.all(runs);
  const failed = results.filter((r) => r.code !== 0);
  console.log(`${failed.length === 0 ? "PASS" : "FAIL"} - ${N} instances starting at once all set up the schema${failed.length ? " :: " + failed[0].err.trim().slice(0, 200) : ""}`);
  await pool.end();
  process.exit(failed.length === 0 ? 0 : 1);
}

(process.argv[2] === "child" ? child() : parent());
