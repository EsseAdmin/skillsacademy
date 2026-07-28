import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';

export type AcademyAdmin = {
  academyId: number;
  userId: number;
};

/**
 * ADAPT THIS to however your app already authenticates admins — this is the
 * single integration point every route in this feature depends on.
 *
 * Written assuming (unconfirmed — `jose` and `bcryptjs` are already
 * dependencies, which suggests a JWT session cookie + password auth, but the
 * cookie name, claim names, and admin-role check below are guesses):
 *   - a session JWT is stored in a cookie (name guessed as "session" below)
 *   - it's signed with a symmetric secret in AUTH_SECRET / SESSION_SECRET
 *   - its payload includes an academyId and a role/isAdmin claim
 *
 * Replace the body of this function with a call into your real session
 * helper if one already exists — do not duplicate auth logic if so.
 */
export async function requireAcademyAdmin(): Promise<AcademyAdmin> {
  const cookieStore = await cookies();
  const token = cookieStore.get('session')?.value; // CHECK: real cookie name

  if (!token) {
    throw Object.assign(new Error('Not authenticated.'), { status: 401 });
  }

  const secret = process.env.AUTH_SECRET || process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET/SESSION_SECRET not configured.');
  }

  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));

  const academyId = Number(payload.academyId); // CHECK: real claim name
  const userId = Number(payload.sub ?? payload.userId); // CHECK: real claim name
  const role = payload.role; // CHECK: real claim name / value for "admin"

  if (!academyId || role !== 'admin') {
    throw Object.assign(new Error('Not authorized for this academy.'), { status: 403 });
  }

  return { academyId, userId };
}
