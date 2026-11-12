"use server";

import { redirect } from "next/navigation";
import { Academies, Users, Plans } from "@/lib/queries";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import { safeLearnerNext } from "@/lib/nextPath";
import { ROLE_HOME } from "@/lib/roleHome";
import { getT, normalizeLang } from "@/lib/i18n";
import { validateEmailIsReal } from "@/lib/emailValidation";
import { issueEmailVerificationEmail } from "@/lib/emailVerification";

export type RegisterState = { error?: string } | undefined;

// Self-service learner sign-up for a specific academy — distinct from
// admin/instructor accounts, which are always provisioned by an academy
// admin via the People page (see lib/actions/users.ts). A learner picks
// their own password here and is logged straight in — a verification
// email is still sent in the background (see lib/emailVerification.ts),
// but login isn't gated on clicking it (see
// lib/actions/auth.ts#tenantLogin).
export async function registerLearner(slug: string, _prevState: RegisterState, formData: FormData): Promise<RegisterState> {
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  const academy = await Academies.bySlug(slug);
  if (!academy) return { error: getT()("err_academy_not_found") };
  const lang = normalizeLang(academy.language);
  const t = getT(lang);

  if (!name || !email) return { error: t("err_name_email_required") };
  if (password.length < 8) return { error: t("err_password_short") };
  if (password !== confirmPassword) return { error: t("err_password_mismatch") };

  // The checker's own explanation is English-only, so other languages get the generic wording.
  const emailCheck = await validateEmailIsReal(email);
  if (!emailCheck.valid) return { error: (lang === "en" && emailCheck.reason) || t("err_valid_email") };

  const existing = await Users.byAcademyAndEmail(academy.id, email);
  if (existing) return { error: t("err_account_exists") };

  // Same learner-capacity check as the admin "People" page's addUser, so
  // self-registration can't let an academy exceed what its plan allows.
  const plan = await Plans.byId(academy.plan_id);
  if (plan?.max_learners != null) {
    const currentLearners = (await Users.listByAcademy(academy.id, "LEARNER")).length;
    if (currentLearners >= plan.max_learners) {
      return { error: t("err_learner_limit", { name: academy.name }) };
    }
  }

  const newUser = await Users.create({
    academy_id: academy.id,
    role: "LEARNER",
    name,
    email,
    password_hash: await hashPassword(password),
  });

  await setSessionCookie({
    userId: newUser.id,
    role: newUser.role,
    academyId: academy.id,
    academySlug: academy.slug,
    name: newUser.name,
    email: newUser.email,
  });

  try {
    await issueEmailVerificationEmail(academy, newUser, slug);
  } catch (err) {
    console.error(`[email] Failed to send verification email for new learner ${newUser.id} (${slug}):`, err);
  }

  redirect(safeLearnerNext(slug, formData.get("next")) ?? `/a/${slug}/${ROLE_HOME[newUser.role]}`);
}
