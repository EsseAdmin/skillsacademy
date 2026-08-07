"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { Users, Academies, Plans } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { hashPassword } from "@/lib/auth";
import { issuePasswordResetEmail } from "@/lib/passwordResetEmail";
import { validateEmailIsReal } from "@/lib/emailValidation";
import type { FormState } from "./auth";

export async function addUser(slug: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const role = String(formData.get("role") || "LEARNER") as "INSTRUCTOR" | "LEARNER";
  if (session.role === "INSTRUCTOR" && role !== "LEARNER") {
    return { error: "Instructors can only add learners." };
  }
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!name || !email) return { error: "Name and email are required." };

  // Optional: the admin can set the new person's initial password directly
  // (e.g. to hand it to them in person) instead of relying entirely on the
  // emailed "set your password" link below. Left blank, behaviour is
  // unchanged from before.
  const password = String(formData.get("password") || "");
  if (password && password.length < 8) {
    return { error: "Password must be at least 8 characters, or leave it blank to email a set-password link instead." };
  }

  const emailCheck = await validateEmailIsReal(email);
  if (!emailCheck.valid) return { error: emailCheck.reason || "Please enter a valid email address." };

  const academy = await Academies.byId(session.academyId!);
  if (!academy) return { error: "Academy not found." };

  if (role === "LEARNER") {
    const plan = await Plans.byId(academy.plan_id);
    if (plan?.max_learners != null) {
      const currentLearners = (await Users.listByAcademy(academy.id, "LEARNER")).length;
      if (currentLearners >= plan.max_learners) {
        return { error: `Your ${plan.name} plan allows up to ${plan.max_learners} learners. Upgrade to add more.` };
      }
    }
  } else {
    const plan = await Plans.byId(academy.plan_id);
    if (plan?.max_instructors != null) {
      const currentInstructors = (await Users.listByAcademy(academy.id, "INSTRUCTOR")).length;
      if (currentInstructors >= plan.max_instructors) {
        return { error: `Your ${plan.name} plan allows up to ${plan.max_instructors} instructors. Upgrade to add more.` };
      }
    }
  }

  const existing = await Users.byAcademyAndEmail(academy.id, email);
  if (existing) return { error: "A user with that email already exists in this academy." };

  // Two ways a new account gets its first password:
  //  - Admin sets one directly on this form (e.g. to hand it to the person
  //    in person) — used as-is, no email sent, since there's nothing to
  //    "set" via a link anymore.
  //  - Left blank (the default): created with a random, never-shown
  //    placeholder password (nobody needs to know it, since nobody logs in
  //    with it) and immediately emailed a "set your password" link using
  //    the same mechanism as the forgot-password flow.
  const newUser = await Users.create({
    academy_id: academy.id,
    role,
    name,
    email,
    password_hash: await hashPassword(password || crypto.randomBytes(24).toString("hex")),
  });
  if (!password) {
    await issuePasswordResetEmail(academy, newUser, slug, "welcome");
  }

  const area = session.role === "ACADEMY_ADMIN" ? "admin" : "instructor";
  revalidatePath(`/a/${slug}/${area}/people`);
  revalidatePath(`/a/${slug}/instructor/learners`);
  return { error: undefined };
}

export async function toggleUserActive(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const userId = String(formData.get("userId") || "");
  const user = await Users.byId(userId);
  if (!user || user.academy_id !== session.academyId) return;
  await Users.setActive(userId, !user.is_active);
  revalidatePath(`/a/${slug}/admin/people`);
}

export async function removeUser(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const userId = String(formData.get("userId") || "");
  const user = await Users.byId(userId);
  if (!user || user.academy_id !== session.academyId) return;
  if (user.role === "ACADEMY_ADMIN") return; // cannot remove admins here
  await Users.remove(userId);
  revalidatePath(`/a/${slug}/admin/people`);
}
