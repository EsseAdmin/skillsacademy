import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import type { Role } from "./queries";

const SESSION_COOKIE = "sa_session";
import { authSecret, isLiveDeployment, usingFallbackSecret } from "./secret";
import { createHmac } from "node:crypto";

const secretKey = authSecret();
const key = new TextEncoder().encode(secretKey);
if (isLiveDeployment() && usingFallbackSecret()) {
  console.error("SECURITY: AUTH_SECRET is not set. Sessions are signed with a key that is public in the source code. Set AUTH_SECRET in the site's environment variables now.");
}

export interface SessionPayload {
  userId: string;
  role: Role;
  academyId: string | null;
  academySlug: string | null;
  name: string;
  email: string;
  [key: string]: unknown;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// A real hash to compare against when no account matches, so "no such account" takes as long as "wrong password".
let dummyHash: string | null = null;
export async function spendPasswordTime(password: string): Promise<void> {
  dummyHash ??= bcrypt.hashSync("not-a-real-password", 10);
  await bcrypt.compare(password, dummyHash);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

// A short fingerprint of the account's current password. It rides in the session cookie, so changing or resetting the
// password signs the account out everywhere else. Cookies issued before this existed have none and stay valid.
function passwordVersion(hash: string): string {
  return createHmac("sha256", secretKey).update(hash).digest("hex").slice(0, 16);
}

async function accountRow(userId: string, role: string): Promise<{ hash: string; active: boolean; academyId: string | null } | null> {
  const { queryOne } = await import("./db");
  if (role === "SUPER_ADMIN") {
    const r = await queryOne<{ password_hash: string }>("SELECT password_hash FROM super_admins WHERE id = $1", [userId]);
    return r ? { hash: r.password_hash, active: true, academyId: null } : null;
  }
  const r = await queryOne<{ password_hash: string; is_active: number; academy_id: string | null }>(
    "SELECT password_hash, is_active, academy_id FROM users WHERE id = $1",
    [userId]
  );
  return r ? { hash: r.password_hash, active: Number(r.is_active) === 1, academyId: r.academy_id } : null;
}

// Per-instance memory of "this account is still fine" so most page loads cost no extra query. Deactivating an account
// or changing its password takes effect within this many seconds.
const LIVE_TTL_MS = 30_000;
const liveCache = new Map<string, number>();

async function sessionStillValid(p: SessionPayload): Promise<boolean> {
  const cacheKey = `${p.userId}|${p.role}|${p.academyId ?? ""}|${(p.pv as string | undefined) ?? ""}`;
  const hit = liveCache.get(cacheKey);
  if (hit && hit > Date.now()) return true;
  let row;
  try {
    row = await accountRow(p.userId, p.role);
  } catch {
    return false;
  }
  if (!row || !row.active) return false;
  if (p.role !== "SUPER_ADMIN" && row.academyId !== p.academyId) return false;
  if (typeof p.pv === "string" && p.pv !== passwordVersion(row.hash)) return false;
  if (liveCache.size > 5000) liveCache.clear();
  liveCache.set(cacheKey, Date.now() + LIVE_TTL_MS);
  return true;
}

export async function setSessionCookie(payload: SessionPayload) {
  try {
    const row = await accountRow(payload.userId, payload.role);
    if (row) payload = { ...payload, pv: passwordVersion(row.hash) };
  } catch {
    /* no fingerprint: the session still works, it just isn't tied to the password */
  }
  const token = await createSessionToken(payload);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session) return null;
  // The cookie alone is not enough: the account must still exist, be active and (if tied to one) have the same password.
  return (await sessionStillValid(session)) ? session : null;
}

// ---- Pending second step of the Super Admin sign-in (password accepted, emailed code not yet entered) ----
const PENDING_COOKIE = "sa_2fa";
const PENDING_MINUTES = 10;

export async function setPendingCookie(adminId: string, challengeId: string) {
  const token = await new SignJWT({ adminId, challengeId, purpose: "sa-2fa" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${PENDING_MINUTES}m`)
    .sign(key);
  const store = await cookies();
  store.set(PENDING_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PENDING_MINUTES * 60,
  });
}

export async function readPendingCookie(): Promise<{ adminId: string; challengeId: string } | null> {
  const store = await cookies();
  const token = store.get(PENDING_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (payload.purpose !== "sa-2fa" || typeof payload.adminId !== "string" || typeof payload.challengeId !== "string") return null;
    return { adminId: payload.adminId, challengeId: payload.challengeId };
  } catch {
    return null;
  }
}

export async function clearPendingCookie() {
  const store = await cookies();
  store.delete(PENDING_COOKIE);
}

/** Keyed hash of a sign-in code, so a copy of the database can't reveal live codes. */
export async function hashLoginCode(challengeId: string, code: string): Promise<string> {
  const { createHmac } = await import("node:crypto");
  return createHmac("sha256", secretKey).update(`${challengeId}:${code}`).digest("hex");
}

export { SESSION_COOKIE };
