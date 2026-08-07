"use server";

import { redirect } from "next/navigation";
import { Academies, Users, Plans } from "@/lib/queries";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import { ROLE_HOME } from "@/lib/roleHome";
import { validateEmailIsReal } from "@/lib/emailValidation";

export type RegisterState = { error?: string } | undefined;

// Self-service learner sign-up for a specific academy — distinct from
// admin/instructor accounts, which are always provisioned by an academy
// admin via the People page (see lib/actions/users.ts). A learner picks
// their own password here and is logged straight in, rather than being
// emailed a set-password link the way an admin-added account is: they're
// present and choosing it themselves right now, so there's nothing to
// verify via email first.
export async function registerLearner(slug: string, _prevState: RegisterState, formData: FormData): Promise<RegisterState> {
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (!name || !email) return { error: "Name and email are required." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password !== confirmPassword) return { error: "Passwords don't match." };

  const emailCheck = await validateEmailIsReal(email);
  if (!emailCheck.valid) return { error: emailCheck.reason || "Please enter a valid email address." };

  const academy = await Academies.bySlug(slug);
  if (!academy) return { error: "We couldn't find that academy." };

  const existing = await Users.byAcademyAndEmail(academy.id, email);
  if (existing) return { error: "An account with that email already exists at this academy — log in instead." };

  // Same learner-capacity check as the admin "People" page's addUser, so
  // self-registration can't let an academy exceed what its plan allows.
  const plan = await Plans.byId(academy.plan_id);
  if (plan?.max_learners != null) {
    const currentLearners = (await Users.listByAcademy(academy.id, "LEARNER")).length;
    if (currentLearners >= plan.max_learners) {
      return { error: `${academy.name} has reached its maximum number of learners for now. Please contact the academy directly.` };
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

  redirect(`/a/${slug}/${ROLE_HOME[newUser.role]}`);
}
