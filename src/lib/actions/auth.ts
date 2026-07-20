"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Academies, Users, SuperAdmins } from "@/lib/queries";
import { verifyPassword, setSessionCookie, clearSessionCookie } from "@/lib/auth";

export type FormState = { error?: string } | undefined;

const ROLE_HOME: Record<string, string> = {
  ACADEMY_ADMIN: "admin",
  INSTRUCTOR: "instructor",
  LEARNER: "learner",
};

export async function tenantLogin(slug: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  const academy = await Academies.bySlug(slug);
  if (!academy) return { error: "We couldn't find that academy." };

  const user = await Users.byAcademyAndEmail(academy.id, email);
  if (!user || !user.is_active) return { error: "Invalid email or password." };

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return { error: "Invalid email or password." };

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

export async function superAdminLogin(_prevState: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  const admin = await SuperAdmins.byEmail(email);
  if (!admin) return { error: "Invalid email or password." };

  const ok = await verifyPassword(password, admin.password_hash);
  if (!ok) return { error: "Invalid email or password." };

  await setSessionCookie({
    userId: admin.id,
    role: "SUPER_ADMIN",
    academyId: null,
    academySlug: null,
    name: admin.name,
    email: admin.email,
  });

  redirect("/super-admin");
}

export async function logout(formData: FormData) {
  const redirectTo = String(formData.get("redirectTo") || "/");
  await clearSessionCookie();
  revalidatePath("/", "layout");
  redirect(redirectTo);
}

export async function findAcademyAndRedirect(_prevState: FormState, formData: FormData): Promise<FormState> {
  const query = String(formData.get("slug") || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-");
  if (!query) return { error: "Enter your academy's web address." };
  const academy = await Academies.bySlug(query);
  if (!academy) return { error: `We couldn't find an academy at "${query}".` };
  redirect(`/a/${academy.slug}/login`);
}
