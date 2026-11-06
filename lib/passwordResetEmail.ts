import crypto from "node:crypto";
import { PasswordResetTokens, type Academy, type AppUser } from "@/lib/queries";
import { sendEmail } from "@/lib/email";
import { currentOrigin } from "@/lib/requestOrigin";
import { getT, normalizeLang } from "@/lib/i18n";

// Plain (non "use server") helper module shared by both the "forgot my
// password" flow (lib/actions/passwordReset.ts) and new-user creation
// (lib/actions/users.ts), which both need to issue a token and email a
// link — one framed as "reset your password", the other as "set your
// password for your new account". Kept out of a "use server" file since
// it isn't itself meant to be called directly as a form action.

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function issuePasswordResetEmail(
  academy: Academy,
  user: AppUser,
  slug: string,
  kind: "reset" | "welcome"
): Promise<void> {
  // Invalidate any earlier unused link before issuing a new one, so only
  // the most recently requested link can actually be used.
  await PasswordResetTokens.invalidateAllForUser(user.id);

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashResetToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  await PasswordResetTokens.create(user.id, tokenHash, expiresAt);

  const origin = await currentOrigin();
  const link = `${origin}/a/${slug}/reset-password?token=${token}`;

  // Written in the academy's language, since the recipient is its learner (or staff member).
  const lang = normalizeLang(academy.language);
  const t = getT(lang);
  const subject = kind === "welcome" ? t("email_welcome_subject", { academy: academy.name }) : t("email_reset_subject", { academy: academy.name });
  const introKey = kind === "welcome" ? "email_welcome_intro" : "email_reset_intro";
  const intro = t(introKey, { academy: `<strong>${escapeHtml(academy.name)}</strong>` });
  const introText = t(introKey, { academy: academy.name });
  const expiry = t("email_reset_expiry");

  const html = `
    <div lang="${lang}" style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 480px; margin: 0 auto; color: #0B1F3B;">
      <p>${intro}</p>
      <p style="margin: 24px 0;">
        <a href="${link}" style="background:#0B1F3B; color:#fff; padding:12px 20px; border-radius:6px; text-decoration:none; font-weight:600; display:inline-block;">
          ${kind === "welcome" ? t("email_welcome_button") : t("email_reset_button")}
        </a>
      </p>
      <p style="font-size:13px; color:#6b7280;">${expiry}</p>
      <p style="font-size:12px; color:#9ca3af; word-break:break-all;">${t("email_paste_link")} ${link}</p>
    </div>`;
  const text = `${introText}\n\n${link}\n\n${expiry}`;

  await sendEmail({ to: user.email, subject, html, text });
}
