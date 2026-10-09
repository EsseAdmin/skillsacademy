"use server";

import { revalidatePath } from "next/cache";
import { Courses, Academies, Plans } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { saveFile } from "@/lib/storage";
import { hasSeoTier, SeoTierError } from "@/lib/seoTiers";

async function requireCourseAndTier(slug: string, courseId: string, tier: "starter" | "growth" | "enterprise") {
  // SEO/marketing tools are academy-admin only (confirmed scope), unlike
  // quizzes/SCORM/live-sessions which instructors can also author.
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const course = await Courses.byId(courseId);
  if (!course || course.academy_id !== session.academyId) throw new Error("Course not found.");
  const academy = await Academies.byId(session.academyId!);
  const plan = academy ? await Plans.byId(academy.plan_id) : undefined;
  if (!plan || !hasSeoTier(plan.key, tier)) throw new SeoTierError("This SEO feature", tier);
  return { session, course };
}

export async function updateCourseSeoMeta(slug: string, formData: FormData) {
  const courseId = String(formData.get("courseId") || "");
  const { course } = await requireCourseAndTier(slug, courseId, "starter");

  await Courses.updateSeo(course.id, {
    seo_meta_title: String(formData.get("seo_meta_title") || "").trim() || null,
    seo_meta_description: String(formData.get("seo_meta_description") || "").trim() || null,
  });

  revalidatePath(`/a/${slug}/admin/marketing`);
  revalidatePath(`/a/${slug}/courses/${course.id}`);
}

export async function uploadCourseOgImage(slug: string, formData: FormData) {
  const courseId = String(formData.get("courseId") || "");
  const { course } = await requireCourseAndTier(slug, courseId, "growth");

  const file = formData.get("image") as File | null;
  if (!file || file.size === 0) return;
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storedName = `og-images/${course.id}-${crypto.randomUUID()}-${safeName}`;
  await saveFile(storedName, Buffer.from(await file.arrayBuffer()));

  await Courses.updateSeo(course.id, { seo_og_image_path: storedName });
  revalidatePath(`/a/${slug}/admin/marketing`);
  revalidatePath(`/a/${slug}/courses/${course.id}`);
}

// Template-based marketing copy generator. This deterministically drafts
// copy from the course's own title/description/price rather than calling an
// external LLM (no AI provider credential is configured for this platform)
// — it gives instructors/admins a solid, editable starting draft they can
// copy and refine, and can be swapped for a live AI call later without
// changing the schema (seo_social_copy_json / seo_ad_snippet_json).
export async function generateMarketingCopy(slug: string, formData: FormData) {
  const courseId = String(formData.get("courseId") || "");
  const { course } = await requireCourseAndTier(slug, courseId, "enterprise");
  const academy = (await Academies.byId(course.academy_id))!;

  const priceLabel = course.price_pence > 0 ? `£${(course.price_pence / 100).toFixed(2)}` : "free";
  const hook = course.description ? course.description.split(/(?<=[.!?])\s/)[0] : `Learn ${course.title}`;

  const socialCopy = {
    facebook: `📚 New course: "${course.title}" is now open for enrolment at ${academy.name}!\n\n${hook}\n\nJoin for ${priceLabel} → [enrolment link]`,
    linkedin: `We've just launched "${course.title}" at ${academy.name}.\n\n${hook}\n\nPerfect for anyone looking to build this skill — enrol today (${priceLabel}): [enrolment link]`,
    x: `New: "${course.title}" 🎓 ${hook} Enrol now (${priceLabel}): [enrolment link] #${academy.name.replace(/\s+/g, "")}`,
  };

  const adSnippets = {
    google: [
      { headline: `${course.title} — Enrol Today`, description: `${hook} Starting at ${priceLabel}. Sign up now.` },
      { headline: `Learn ${course.title} Online`, description: `Self-paced course from ${academy.name}. ${priceLabel}.` },
      { headline: `${academy.name}: ${course.title}`, description: hook.slice(0, 80) },
    ],
    meta: [{ headline: `${course.title}`, primaryText: `${hook} Enrol today for ${priceLabel}.`, description: academy.name }],
  };

  await Courses.updateSeo(course.id, {
    seo_social_copy_json: JSON.stringify(socialCopy),
    seo_ad_snippet_json: JSON.stringify(adSnippets),
  });

  revalidatePath(`/a/${slug}/admin/marketing`);
}
