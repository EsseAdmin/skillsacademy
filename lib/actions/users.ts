"use server";

import { revalidatePath } from "next/cache";
import { Users, Academies, Plans } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { hashPassword } from "@/lib/auth";
import type { FormState } from "./auth";

export async function addUser(slug: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const role = String(formData.get("role") || "LEARNER") as "INSTRUCTOR" | "LEARNER";
  if (session.role === "INSTRUCTOR" && role !== "LEARNER") {
    return { error: "Instructors can only add learners." };
  }
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "Password123!");
  if (!name || !email) return { error: "Name and email are required." };

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

  await Users.create({
    academy_id: academy.id,
    role,
    name,
    email,
    password_hash: await hashPassword(password),
  });

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
