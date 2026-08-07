"use server";

import { redirect } from "next/navigation";
import { Academies, Users, PasswordResetTokens } from "@/lib/queries";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import { issuePasswordResetEmail, hashResetToken } from "@/lib/passwordResetEmail";
import { ROLE_HOME } from "@/lib/roleHome";

export type RequestResetState = { message: string } | undefined;

// Always returns the same generic message regardless of whether the email
// actually matches an account — otherwise this form could be used to check
// which email addresses have accounts at this academy.
const GENERIC_MESSAGE = "If that email is on an account with us, we've sent a link to reset your password. It expires in an hour.";

export async function requestPasswordReset(slug: string, _prevState: RequestResetState, formData: FormData): Promise<RequestResetState> {
  const email = String(formData.get("email") || "").trim();
  if (!email) return { message: GENERIC_MESSAGE };

  const academy = await Academies.bySlug(slug);
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

  if (!token) return { error: "This reset link is invalid — request a new one." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password !== confirmPassword) return { error: "Passwords don't match." };

  const academy = await Academies.bySlug(slug);
  if (!academy) return { error: "We couldn't find that academy." };

  const record = await PasswordResetTokens.byTokenHash(hashResetToken(token));
  if (!record || record.used_at || new Date(record.expires_at).getTime() < Date.now()) {
    return { error: "This reset link is invalid or has expired. Request a new one." };
  }

  const user = await Users.byId(record.user_id);
  if (!user || !user.is_active || user.academy_id !== academy.id) {
    return { error: "This reset link is invalid. Request a new one." };
  }

  await Users.setPassword(user.id, await hashPassword(password));
  await PasswordResetTokens.markUsed(record.id);

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
