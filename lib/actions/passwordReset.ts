"use server";

import { redirect } from "next/navigation";
import { Academies, Users, PasswordResetTokens } from "@/lib/queries";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import { issuePasswordResetEmail, hashResetToken } from "@/lib/passwordResetEmail";
import { ROLE_HOME } from "@/lib/roleHome";
import { getT } from "@/lib/i18n";

export type RequestResetState = { message: string } | undefined;

// Always returns the same generic message regardless of whether the email
// actually matches an account — otherwise this form could be used to check
// which email addresses have accounts at this academy.

export async function requestPasswordReset(slug: string, _prevState: RequestResetState, formData: FormData): Promise<RequestResetState> {
  const email = String(formData.get("email") || "").trim();
  const academy = await Academies.bySlug(slug);
  const GENERIC_MESSAGE = getT(academy?.language)("forgot_sent");
  if (!email) return { message: GENERIC_MESSAGE };
  if (!academy) return { message: GENERIC_MESSAGE };

  const user = await Users.byAcademyAndEmail(academy.id, email);
  if (user && user.is_active) {
    await issuePasswordResetEmail(academy, user, slug, "reset");
  }

  return { message: GENERIC_MESSAGE };
}

export type ResetPasswordState = { error?: string } | undefined;

export async function resetPassword(slug: string, _prevState: ResetPasswordState, formData: FormData): Promise<ResetPasswordState> {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  const academy = await Academies.bySlug(slug);
  const t = getT(academy?.language);
  if (!token) return { error: t("err_reset_invalid_new") };
  if (password.length < 8) return { error: t("err_password_short") };
  if (password !== confirmPassword) return { error: t("err_password_mismatch") };
  if (!academy) return { error: t("err_academy_not_found") };

  const record = await PasswordResetTokens.byTokenHash(hashResetToken(token));
  if (!record || record.used_at || new Date(record.expires_at).getTime() < Date.now()) {
    return { error: t("err_reset_expired") };
  }

  const user = await Users.byId(record.user_id);
  if (!user || !user.is_active || user.academy_id !== academy.id) {
    return { error: t("err_reset_invalid") };
  }

  await Users.setPassword(user.id, await hashPassword(password));
  await PasswordResetTokens.markUsed(record.id);

  // Clicking this link — whether it was a "reset your password" or a
  // first-time "set your password" welcome link — already proves the
  // person controls this account's email, so treat that as verifying it
  // too. Harmless no-op if it was already verified some other way.
  await Users.markEmailVerified(user.id);

  // The token already proved the person controls this account's email, so
  // log them straight in rather than making them immediately re-enter the
  // password they just chose.
  await setSessionCookie({
    userId: user.id,
    role: user.role,
    academyId: academy.id,
    academySlug: academy.slug,
    name: user.name,
    email: user.email,
  });

  redirect(`/a/${slug}/${ROLE_HOME[user.role]}`);
}
