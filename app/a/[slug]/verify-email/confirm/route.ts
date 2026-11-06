import { NextRequest, NextResponse } from "next/server";
import { Academies, Users, EmailVerificationTokens } from "@/lib/queries";
import { hashVerificationToken } from "@/lib/emailVerification";
import { setSessionCookie } from "@/lib/auth";
import { ROLE_HOME } from "@/lib/roleHome";

// GET-only route handler (not a page) specifically because consuming a
// verification token has to set a session cookie, and Next.js only
// allows writing cookies from a Server Action or a Route Handler like
// this one — never from a plain page component's render, even
// indirectly through a helper function it calls. The email link points
// here; app/a/[slug]/verify-email/page.tsx is the human-facing page this
// redirects on to (on success) or back to (on failure, with a reason).
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const token = request.nextUrl.searchParams.get("token") || "";
  const back = (reason: string) => NextResponse.redirect(new URL(`/a/${slug}/verify-email?error=${reason}`, request.url));

  if (!token) return back("missing");

  const academy = await Academies.bySlug(slug);
  if (!academy) return back("missing");

  const record = await EmailVerificationTokens.byTokenHash(hashVerificationToken(token));
  const stillValid = record && !record.used_at && new Date(record.expires_at).getTime() >= Date.now();
  if (!stillValid) return back("expired");

  const user = await Users.byId(record.user_id);
  if (!user || !user.is_active || user.academy_id !== academy.id) return back("invalid");

  await Users.markEmailVerified(user.id);
  await EmailVerificationTokens.markUsed(record.id);

  // Log the person straight in on a successful click, same courtesy the
  // password-reset flow extends — convenient regardless of whether they
  // were already logged in (this isn't a login gate, see
  // lib/actions/auth.ts#tenantLogin).
  await setSessionCookie({
    userId: user.id,
    role: user.role,
    academyId: academy.id,
    academySlug: academy.slug,
    name: user.name,
    email: user.email,
  });

  return NextResponse.redirect(new URL(`/a/${slug}/${ROLE_HOME[user.role]}?welcome=1`, request.url));
}
