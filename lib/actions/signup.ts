"use server";

import { redirect } from "next/navigation";
import { Academies, Templates, Plans, Users } from "@/lib/queries";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import { slugify } from "@/lib/utils";
import type { FormState } from "./auth";

export async function signupAcademy(_prevState: FormState, formData: FormData): Promise<FormState> {
  const orgName = String(formData.get("orgName") || "").trim();
  const sector = String(formData.get("sector") || "business");
  const templateKey = String(formData.get("template") || "");
  const planKey = String(formData.get("plan") || "");
  const adminName = String(formData.get("adminName") || "").trim();
  const adminEmail = String(formData.get("adminEmail") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  let slug = slugify(String(formData.get("slug") || orgName));

  if (!orgName || !adminName || !adminEmail || !password || !templateKey || !planKey) {
    return { error: "Please complete every step before creating your academy." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (!slug) {
    return { error: "Please choose a valid academy web address." };
  }

  if (await Academies.slugExists(slug)) {
    slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
  }

  const templates = await Templates.all();
  const plans = await Plans.all(true);
  const template = templates.find((t) => t.key === templateKey);
  const plan = plans.find((p) => p.key === planKey);
  if (!template || !plan) {
    return { error: "Please choose a valid template and plan." };
  }

  const academy = await Academies.create({
    slug,
    name: orgName,
    sector,
    template_id: template.id,
    plan_id: plan.id,
    trial_days: plan.trial_days,
    logo_text: orgName,
    contact_email: adminEmail,
  });

  const admin = await Users.create({
    academy_id: academy.id,
    role: "ACADEMY_ADMIN",
    name: adminName,
    email: adminEmail,
    password_hash: await hashPassword(password),
  });

  await setSessionCookie({
    userId: admin.id,
    role: "ACADEMY_ADMIN",
    academyId: academy.id,
    academySlug: academy.slug,
    name: admin.name,
    email: admin.email,
  });

  redirect(`/a/${slug}/admin?welcome=1`);
}
