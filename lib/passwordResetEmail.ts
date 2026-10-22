import crypto from "node:crypto";
import { PasswordResetTokens, type Academy, type AppUser } from "@/lib/queries";
import { sendEmail } from "@/lib/email";
import { currentOrigin } from "@/lib/requestOrigin";

// Plain (non "use server") helper module shared by both the "forgot my
// password" flow (lib/actions/passwordReset.ts) and new-user creation
// (lib/actions/users.ts), which both need to issue a token and email a
// link — one framed as "reset your password", the other as "set your
// password for your new account". Kept out of a "use server" file since
// it isn't itself meant to be called directly as a form action.

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

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

  const subject = kind === "welcome" ? `Set your password for ${academy.name}` : `Reset your password for ${academy.name}`;
  const intro =
    kind === "welcome"
      ? `An account has been created for you at <strong>${academy.name}</strong> on SkillsAcademy.ai. Set a password to log in for the first time:`
      : `We received a request to reset your password for <strong>${academy.name}</strong> on SkillsAcademy.ai. Click below to choose a new one:`;
  const introText =
    kind === "welcome"
      ? `An account has been created for you at ${academy.name} on SkillsAcademy.ai. Set a password to log in for the first time:`
      : `We received a request to reset your password for ${academy.name} on SkillsAcademy.ai. Click the link below to choose a new one:`;

  const html = `
    <div style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 480px; margin: 0 auto; color: #0B1F3B;">
      <p>${intro}</p>
      <p style="margin: 24px 0;">
        <a href="${link}" style="background:#0B1F3B; color:#fff; padding:12px 20px; border-radius:6px; text-decoration:none; font-weight:600; display:inline-block;">
          ${kind === "welcome" ? "Set your password" : "Reset your password"}
        </a>
      </p>
      <p style="font-size:13px; color:#6b7280;">This link expires in 1 hour and can only be used once. If you didn't expect this email, you can safely ignore it — your password won't be changed.</p>
      <p style="font-size:12px; color:#9ca3af; word-break:break-all;">Or paste this link into your browser: ${link}</p>
    </div>`;
  const text = `${introText}\n\n${link}\n\nThis link expires in 1 hour and can only be used once. If you didn't expect this email, you can safely ignore it — your password won't be changed.`;

  await sendEmail({ to: user.email, subject, html, text });
}
