"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Academies, Plans, SubscriptionInvoices } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import type { FormState } from "./auth";

export async function subscribeAcademy(slug: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const planKey = String(formData.get("plan") || "");
  const plans = await Plans.all(true);
  const plan = plans.find((p) => p.key === planKey);
  if (!plan) return { error: "Please choose a valid plan." };

  const cardNumber = String(formData.get("cardNumber") || "").replace(/\s+/g, "");
  const expiry = String(formData.get("expiry") || "");
  const cvc = String(formData.get("cvc") || "");
  if (!/^\d{12,19}$/.test(cardNumber)) return { error: "Enter a valid card number." };
  if (!/^\d{2}\s*\/\s*\d{2}$/.test(expiry)) return { error: "Enter a valid expiry (MM/YY)." };
  if (!/^\d{3,4}$/.test(cvc)) return { error: "Enter a valid CVC." };

  const academy = await Academies.byId(session.academyId!);
  if (!academy) return { error: "Academy not found." };

  await Academies.update(academy.id, { plan_id: plan.id, subscription_status: "active" });
  await SubscriptionInvoices.create({ academy_id: academy.id, plan_id: plan.id, amount_pence: plan.price_pence });

  revalidatePath(`/a/${slug}/admin/billing`);
  redirect(`/a/${slug}/admin/billing?updated=1`);
}

export async function changePlanTrial(slug: string, formData: FormData) {
  // allows switching plan while still on trial without payment
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const planKey = String(formData.get("plan") || "");
  const plans = await Plans.all(true);
  const plan = plans.find((p) => p.key === planKey);
  if (!plan) return;
  await Academies.update(session.academyId!, { plan_id: plan.id });
  revalidatePath(`/a/${slug}/admin/billing`);
}
