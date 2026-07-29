"use server";

import { revalidatePath } from "next/cache";
import { Academies, Templates } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";

export async function updateBranding(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const templateKey = String(formData.get("template") || "");
  const templates = await Templates.all();
  const template = templates.find((t) => t.key === templateKey);
  if (!template) return;
  await Academies.update(session.academyId!, { template_id: template.id });
  revalidatePath(`/a/${slug}`, "layout");
}

export async function updateAcademyProfile(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const name = String(formData.get("name") || "").trim();
  const logo_text = String(formData.get("logo_text") || "").trim();
  if (!name) return;
  await Academies.update(session.academyId!, { name, logo_text: logo_text || name });
  revalidatePath(`/a/${slug}`, "layout");
}

export async function updateSiteContent(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const hero_headline = String(formData.get("hero_headline") || "").trim();
  const hero_tagline = String(formData.get("hero_tagline") || "").trim();
  const about_text = String(formData.get("about_text") || "").trim();
  await Academies.update(session.academyId!, { hero_headline, hero_tagline, about_text });
  revalidatePath(`/a/${slug}/admin/site`);
  revalidatePath(`/a/${slug}`);
}

export async function togglePublish(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const publish = String(formData.get("publish") || "") === "1";
  await Academies.update(session.academyId!, { is_published: publish });
  revalidatePath(`/a/${slug}/admin/site`);
  revalidatePath(`/a/${slug}/admin`);
  revalidatePath(`/a/${slug}`);
}
