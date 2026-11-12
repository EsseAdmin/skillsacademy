"use server";

import { Academies, Users } from "@/lib/queries";
import { issueEmailVerificationEmail } from "@/lib/emailVerification";
import { getT } from "@/lib/i18n";

export type ResendVerificationState = { message: string } | undefined;

// Always returns the same generic message regardless of whether the email
// actually matches an account, or whether that account is already
// verified — otherwise this form could be used to enumerate which email
// addresses have accounts at this academy (same reasoning as
// lib/actions/passwordReset.ts#requestPasswordReset).

export async function resendVerificationEmail(
  slug: string,
  _prevState: ResendVerificationState,
  formData: FormData
): Promise<ResendVerificationState> {
  const email = String(formData.get("email") || "").trim();
  const academy = await Academies.bySlug(slug);
  const GENERIC_MESSAGE = getT(academy?.language)("verify_sent");
  if (!email) return { message: GENERIC_MESSAGE };
  if (!academy) return { message: GENERIC_MESSAGE };

  const user = await Users.byAcademyAndEmail(academy.id, email);
  if (user && user.is_active && !user.email_verified_at) {
    await issueEmailVerificationEmail(academy, user, slug);
  }

  return { message: GENERIC_MESSAGE };
}
