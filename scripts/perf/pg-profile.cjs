/* eslint-disable @typescript-eslint/no-require-imports */
// Loaded with NODE_OPTIONS="--require ./scripts/perf/pg-profile.cjs" so every database query the
// app makes is timed and appended to $PG_PROFILE_LOG (default /tmp/pg-profile.log) as "ms<TAB>sql".
const fs = require("node:fs");
const pg = require("pg");
const log = process.env.PG_PROFILE_LOG || "/tmp/pg-profile.log";
const orig = pg.Client.prototype.query;
function record(t0, sql) {
  try { fs.appendFileSync(log, `${(performance.now() - t0).toFixed(1)}\t${String(sql).replace(/\s+/g, " ").slice(0, 110)}\n`); } catch {}
}
pg.Client.prototype.query = function (...args) {
  const first = args[0];
  const sql = typeof first === "string" ? first : first && first.text;
  const t0 = performance.now();
  if (!sql || sql.length > 20000) return orig.apply(this, args);
  const last = args[args.length - 1];
  if (typeof last === "function") {
    args[args.length - 1] = function (...cbArgs) { record(t0, sql); return last.apply(this, cbArgs); };
    return orig.apply(this, args);
  }
  const r = orig.apply(this, args);
  if (r && typeof r.then === "function") return r.then((x) => { record(t0, sql); return x; });
  return r;
};
