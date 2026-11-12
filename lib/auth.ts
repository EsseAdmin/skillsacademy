import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import type { Role } from "./queries";

const SESSION_COOKIE = "sa_session";
const secretKey = process.env.AUTH_SECRET || "skillsacademy-dev-secret-change-me-in-production";
const key = new TextEncoder().encode(secretKey);

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
    const { payload } = await jwtVerify(token, key);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function setSessionCookie(payload: SessionPayload) {
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
  return verifySessionToken(token);
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
    const { payload } = await jwtVerify(token, key);
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
