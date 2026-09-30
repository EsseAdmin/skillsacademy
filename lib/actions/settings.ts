"use server";

import { revalidatePath } from "next/cache";
import { Academies, Templates } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";

export async function updateBranding(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const templateKey = String(formData.get("template") || "");
  // Include this academy's own custom templates alongside the presets, so
  // selecting one it created works the same way as selecting a preset.
  const templates = await Templates.all(session.academyId!);
  const template = templates.find((t) => t.key === templateKey);
  if (!template) return;
  await Academies.update(session.academyId!, { template_id: template.id });
  revalidatePath(`/a/${slug}`, "layout");
}

const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export async function createCustomTemplate(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const primary_color = String(formData.get("primary_color") || "").trim();
  const secondary_color = String(formData.get("secondary_color") || "").trim();
  const accent_color = String(formData.get("accent_color") || "").trim();
  const font_heading = String(formData.get("font_heading") || "Inter").trim();

  if (!name) throw new Error("Give your template a name.");
  for (const [label, value] of [
    ["Primary colour", primary_color],
    ["Secondary colour", secondary_color],
    ["Accent colour", accent_color],
  ] as const) {
    if (!HEX_COLOR_RE.test(value)) {
      throw new Error(`${label} must be a valid hex colour (e.g. #1A2B3C).`);
    }
  }

  const template = await Templates.createCustom({
    academy_id: session.academyId!,
    name,
    description: description || "Custom template",
    primary_color,
    secondary_color,
    accent_color,
    font_heading,
  });

  // Apply it immediately so the admin sees the effect of what they just
  // built, same as clicking any other template in the gallery.
  await Academies.update(session.academyId!, { template_id: template.id });
  revalidatePath(`/a/${slug}/admin/branding`);
  revalidatePath(`/a/${slug}`, "layout");
}

export async function deleteCustomTemplate(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const templateId = String(formData.get("templateId") || "");
  const academy = await Academies.byId(session.academyId!);
  if (!academy) return;
  // Refuse to delete the academy's currently-active template — the
  // templates.id -> academies.template_id foreign key would reject it
  // anyway, but check here first so we can show a clear reason instead of a
  // raw DB error.
  if (academy.template_id === templateId) {
    throw new Error("Switch to a different template before deleting this one — it's currently active.");
  }
  await Templates.removeCustom(templateId, session.academyId!);
  revalidatePath(`/a/${slug}/admin/branding`);
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
