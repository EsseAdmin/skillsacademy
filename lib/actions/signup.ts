"use server";

import { redirect } from "next/navigation";
import { Academies, Templates, Plans, Users } from "@/lib/queries";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import { slugify } from "@/lib/utils";
import { validateEmailIsReal } from "@/lib/emailValidation";
import { sanitizeAcademyPlan } from "@/lib/ai";
import { applyAcademyPlan } from "@/lib/aiAcademyPlan";
import { issueEmailVerificationEmail } from "@/lib/emailVerification";
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

  const emailCheck = await validateEmailIsReal(adminEmail);
  if (!emailCheck.valid) {
    return { error: emailCheck.reason || "Please enter a valid email address." };
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

  // Still send the verification email — the capability stays in place and
  // clicking it still marks the account verified — but login is no longer
  // gated on it (see lib/actions/auth.ts#tenantLogin), so the admin is
  // logged straight into their new dashboard either way rather than
  // waiting on this. Best-effort: never let a failure here block the
  // signup that already succeeded.
  try {
    await issueEmailVerificationEmail(academy, admin, slug);
  } catch (err) {
    console.error(`[email] Failed to send verification email for new admin ${admin.id} (${academy.slug}):`, err);
  }

  // If the admin used the "Describe your academy" AI step earlier in the
  // wizard, apply the plan they reviewed now that a real academy_id/user
  // exists to attach it to. Deliberately never lets a bad/corrupted plan
  // block signup itself — the academy and admin account above are already
  // created and real; if this fails, log it and continue to the dashboard,
  // where everything the plan would have added (template, homepage
  // content, courses) can still be added manually.
  const aiPlanRaw = String(formData.get("aiPlan") || "");
  if (aiPlanRaw) {
    try {
      const plan = sanitizeAcademyPlan(JSON.parse(aiPlanRaw));
      if (plan) {
        const useAiTemplate = String(formData.get("useAiTemplate") || "") === "1";
        await applyAcademyPlan({
          academyId: academy.id,
          createdByUserId: admin.id,
          plan,
          switchTemplate: useAiTemplate,
        });
      }
    } catch (err) {
      console.error(`[ai] Failed to apply AI academy plan for new academy ${academy.id} (${academy.slug}):`, err);
    }
  }

  redirect(`/a/${slug}/admin?welcome=1`);
}
