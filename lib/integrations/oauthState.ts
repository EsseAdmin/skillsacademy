import { SignJWT, jwtVerify } from "jose";

// The OAuth `state` param round-trips through Zoom's/Microsoft's servers, so
// we can't rely on a cookie or session to remember which academy/admin
// started the "Connect" flow — we encode it directly into a short-lived
// signed token instead, and verify the signature when the callback comes
// back. This also gives us CSRF protection for free (an attacker can't
// forge a state that decodes to a real academy without the signing key).
const secretKey = process.env.AUTH_SECRET || "skillsacademy-dev-secret-change-me-in-production";
const key = new TextEncoder().encode(secretKey);

export interface OAuthStatePayload {
  academyId: string;
  slug: string;
  userId: string;
  provider: "zoom" | "microsoft";
  [key: string]: unknown;
}

export async function createOAuthState(payload: OAuthStatePayload): Promise<string> {
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("15m").sign(key);
}

export async function verifyOAuthState(token: string): Promise<OAuthStatePayload | null> {
  try {
    const { payload } = await jwtVerify(token, key);
    return payload as unknown as OAuthStatePayload;
  } catch {
    return null;
  }
}
