// Small database-backed throttle for sign-in, sign-up and password-reset. It works across serverless instances (the
// counters live in Postgres) and never blocks anyone if the database hiccups: a failing throttle lets the request through.
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { exec, queryOne, newId } from "./db";
import { authSecret } from "./secret";

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-nf-client-connection-ip") || (h.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
}

/** A bucket name that never holds the raw email or address (keyed hash, so a database copy reveals nothing). */
export function bucketKey(kind: string, ...parts: string[]): string {
  const h = createHmac("sha256", authSecret()).update(parts.map((p) => p.toLowerCase()).join("|")).digest("hex").slice(0, 24);
  return `${kind}:${h}`;
}

/** True when this bucket already holds `max` events in the last `windowSec` seconds. */
export async function isLimited(bucket: string, max: number, windowSec: number): Promise<boolean> {
  try {
    const since = new Date(Date.now() - windowSec * 1000).toISOString();
    const row = await queryOne<{ n: number }>("SELECT count(*)::int AS n FROM auth_attempts WHERE bucket = $1 AND created_at >= $2", [bucket, since]);
    return (row?.n ?? 0) >= max;
  } catch {
    return false;
  }
}

export async function recordAttempt(bucket: string): Promise<void> {
  try {
    await exec("INSERT INTO auth_attempts (id, bucket, created_at) VALUES ($1, $2, $3)", [newId(), bucket, new Date().toISOString()]);
    if (Math.random() < 0.02) {
      await exec("DELETE FROM auth_attempts WHERE created_at < $1", [new Date(Date.now() - 86_400_000).toISOString()]);
    }
  } catch {
    /* never block a request because the throttle could not write */
  }
}

export async function clearAttempts(bucket: string): Promise<void> {
  try {
    await exec("DELETE FROM auth_attempts WHERE bucket = $1", [bucket]);
  } catch {
    /* ignore */
  }
}
