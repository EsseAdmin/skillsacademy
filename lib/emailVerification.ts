import crypto from "node:crypto";
import { EmailVerificationTokens, type Academy, type AppUser } from "@/lib/queries";
import { sendEmail } from "@/lib/email";
import { currentOrigin } from "@/lib/requestOrigin";
import { getT, normalizeLang } from "@/lib/i18n";

// Plain (non "use server") helper module, same shape as
// lib/passwordResetEmail.ts, shared by every place a new tenant account is
// created (lib/actions/signup.ts, lib/actions/register.ts,
// lib/actions/users.ts) plus the "resend" action
// (lib/actions/emailVerification.ts). Proves the person controls the
// inbox on their account. Note: this is NOT required to log in —
// lib/actions/auth.ts#tenantLogin doesn't check email_verified_at — this
// is an optional capability that stays available (and still marks the
// account verified when clicked) rather than a login gate.
//
// Kept separate from a "set your password" welcome email: an admin-added
// person who's emailed a set-password link (lib/passwordResetEmail.ts,
// kind: "welcome") proves email ownership by clicking *that* link, so
// they never get a second, separate verification email — only someone who
// already has a password (signup, self-registration, or an admin who set
// the new person's password directly) needs this one.
//
// Verification links live longer than password-reset links (24h vs 1h):
// resetting a password is more sensitive (it's an account-takeover
// vector if a link leaks), while a verification link only confirms
// ownership and logs the person in as themselves — closer in risk to a
// "welcome" link than a reset link, and giving people a day rather than
// an hour to get to their inbox meaningfully cuts down on "my link
// expired" support requests for something that isn't urgent.
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function hashVerificationToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function issueEmailVerificationEmail(academy: Academy, user: AppUser, slug: string): Promise<void> {
  // Invalidate any earlier unused link before issuing a new one, so only
  // the most recently requested link can actually be used.
  await EmailVerificationTokens.invalidateAllForUser(user.id);

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashVerificationToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  await EmailVerificationTokens.create(user.id, tokenHash, expiresAt);

  const origin = await currentOrigin();
  // Points at the confirm route handler, not the /verify-email page
  // itself — consuming the token has to set a session cookie, and
  // Next.js only allows writing cookies from a Server Action or Route
  // Handler, never from a plain page's render. See
  // app/a/[slug]/verify-email/confirm/route.ts.
  const link = `${origin}/a/${slug}/verify-email/confirm?token=${token}`;

  const lang = normalizeLang(academy.language);
  const t = getT(lang);
  const escapedName = academy.name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `
    <div lang="${lang}" style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 480px; margin: 0 auto; color: #0B1F3B;">
      <p>${t("email_verify_intro", { academy: `<strong>${escapedName}</strong>` })}</p>
      <p style="margin: 24px 0;">
        <a href="${link}" style="background:#0B1F3B; color:#fff; padding:12px 20px; border-radius:6px; text-decoration:none; font-weight:600; display:inline-block;">
          ${t("email_verify_button")}
        </a>
      </p>
      <p style="font-size:13px; color:#6b7280;">${t("email_verify_expiry")}</p>
      <p style="font-size:12px; color:#9ca3af; word-break:break-all;">${t("email_paste_link")} ${link}</p>
    </div>`;
  const text = `${t("email_verify_intro", { academy: academy.name })}\n\n${link}\n\n${t("email_verify_expiry")}`;

  await sendEmail({ to: user.email, subject: t("email_verify_subject", { academy: academy.name }), html, text });
}
