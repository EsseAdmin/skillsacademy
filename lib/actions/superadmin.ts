"use server";

import { revalidatePath } from "next/cache";
import { Academies, Plans, PlatformSettings } from "@/lib/queries";
import { requireSuperAdminSession } from "@/lib/authz";
import { getStripeClient, ensureStripePrice } from "@/lib/stripe";
import type { FormState } from "./auth";

export async function deleteAcademy(formData: FormData) {
  await requireSuperAdminSession();
  const id = String(formData.get("academyId") || "");
  await Academies.softDelete(id);
  revalidatePath("/super-admin/academies");
}

export async function restoreAcademy(formData: FormData) {
  await requireSuperAdminSession();
  const id = String(formData.get("academyId") || "");
  await Academies.restore(id);
  revalidatePath("/super-admin/academies");
}

export async function permanentlyDeleteAcademy(formData: FormData) {
  await requireSuperAdminSession();
  const id = String(formData.get("academyId") || "");
  const academy = await Academies.byId(id);
  // Only ever erase an academy that's already sitting in the "Deleted
  // academies" section — guards against a stray/forged form submission
  // permanently wiping out a live academy, since unlike deleteAcademy
  // above, this has no restore afterwards.
  if (!academy || !academy.is_deleted) return;
  await Academies.permanentlyDelete(id);
  revalidatePath("/super-admin/academies");
}

export async function updateAcademyBySuperAdmin(formData: FormData) {
  await requireSuperAdminSession();
  const id = String(formData.get("academyId") || "");
  const plan_id = String(formData.get("plan_id") || "");
  const template_id = String(formData.get("template_id") || "");
  const subscription_status = String(formData.get("subscription_status") || "");
  await Academies.update(id, { plan_id, template_id, subscription_status });
  revalidatePath("/super-admin/academies");
}

export async function createPlan(_prevState: FormState, formData: FormData): Promise<FormState> {
  await requireSuperAdminSession();
  const key = String(formData.get("key") || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const name = String(formData.get("name") || "").trim();
  const priceRaw = String(formData.get("price") || "0");
  const trialDays = parseInt(String(formData.get("trial_days") || "14"), 10) || 14;
  const maxLearners = formData.get("max_learners") ? parseInt(String(formData.get("max_learners")), 10) : null;
  const maxInstructors = formData.get("max_instructors") ? parseInt(String(formData.get("max_instructors")), 10) : null;
  const maxCourses = formData.get("max_courses") ? parseInt(String(formData.get("max_courses")), 10) : null;
  const featuresRaw = String(formData.get("features") || "");
  const features = featuresRaw.split("\n").map((f) => f.trim()).filter(Boolean);

  if (!key || !name) return { error: "Plan key and name are required." };
  if (await Plans.byKey(key)) return { error: "A plan with that key already exists." };

  const existingPlans = await Plans.all();
  await Plans.create({
    key,
    name,
    price_pence: Math.max(0, Math.round(parseFloat(priceRaw || "0") * 100)),
    trial_days: trialDays,
    max_learners: maxLearners,
    max_instructors: maxInstructors,
    max_courses: maxCourses,
    features,
    sort_order: existingPlans.length + 1,
  });
  revalidatePath("/super-admin/plans");
  revalidatePath("/");
  return { error: undefined };
}

export async function updatePlan(formData: FormData) {
  await requireSuperAdminSession();
  const id = String(formData.get("planId") || "");
  const name = String(formData.get("name") || "");
  const priceRaw = String(formData.get("price") || "");
  const trialDays = formData.get("trial_days") ? parseInt(String(formData.get("trial_days")), 10) : undefined;
  const maxLearners = formData.get("max_learners") ? parseInt(String(formData.get("max_learners")), 10) : null;
  const maxInstructors = formData.get("max_instructors") ? parseInt(String(formData.get("max_instructors")), 10) : null;
  const maxCourses = formData.get("max_courses") ? parseInt(String(formData.get("max_courses")), 10) : null;
  const featuresRaw = formData.get("features");
  const features = featuresRaw != null ? String(featuresRaw).split("\n").map((f) => f.trim()).filter(Boolean) : undefined;
  const is_active = formData.get("is_active") === "on";

  await Plans.update(id, {
    name: name || undefined,
    price_pence: priceRaw ? Math.max(0, Math.round(parseFloat(priceRaw) * 100)) : undefined,
    trial_days: trialDays,
    max_learners: maxLearners,
    max_instructors: maxInstructors,
    max_courses: maxCourses,
    features,
    is_active,
  });
  revalidatePath("/super-admin/plans");
  revalidatePath("/");
}

export async function deletePlan(formData: FormData) {
  await requireSuperAdminSession();
  const id = String(formData.get("planId") || "");
  await Plans.delete(id);
  revalidatePath("/super-admin/plans");
  revalidatePath("/");
}

export type StripeSyncState = { error?: string; message?: string } | undefined;

// Provisions a real Stripe Product + Price for every active plan up front,
// so an academy admin subscribing never has to wait on that happening for
// the first time mid-checkout. Also useful to re-run after changing a
// plan's price — Stripe Prices are immutable, so this mints a fresh one
// and points the plan at it (see lib/stripe.ts's ensureStripePrice);
// academies already subscribed keep billing at their original price until
// they resubscribe or change plans, same as most real SaaS billing changes.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState always calls with (prevState, formData); this action needs neither.
export async function syncPlansToStripe(_prevState: StripeSyncState, _formData: FormData): Promise<StripeSyncState> {
  await requireSuperAdminSession();
  const stripe = getStripeClient();
  if (!stripe) {
    return { error: "Add a STRIPE_SECRET_KEY environment variable first — see DEPLOYMENT.md." };
  }

  const plans = await Plans.all(true);
  let synced = 0;
  for (const plan of plans) {
    try {
      const { productId, priceId } = await ensureStripePrice(stripe, plan);
      if (productId !== plan.stripe_product_id || priceId !== plan.stripe_price_id) {
        await Plans.setStripeIds(plan.id, productId, priceId);
      }
      synced++;
    } catch {
      return { error: `Synced ${synced} of ${plans.length} plans before hitting an error on "${plan.name}". Please try again.` };
    }
  }

  revalidatePath("/super-admin/plans");
  return { message: `Synced ${synced} active plan${synced === 1 ? "" : "s"} to Stripe.` };
}

export async function updatePlatformSettings(formData: FormData) {
  await requireSuperAdminSession();
  const toggles = ["certificates_enabled", "charity_discount_enabled", "maintenance_mode", "new_signups_enabled"];
  for (const key of toggles) {
    await PlatformSettings.set(key, formData.get(key) === "on" ? "true" : "false");
  }
  const platformName = String(formData.get("platform_name") || "").trim();
  if (platformName) await PlatformSettings.set("platform_name", platformName);
  revalidatePath("/super-admin/settings");
}
