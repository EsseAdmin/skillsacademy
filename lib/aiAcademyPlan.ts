// Turns a sanitised AcademyPlan (see lib/ai.ts) into real rows, reusing
// the exact same query functions every existing manual admin flow uses
// (Templates.createCustom, Academies.update, SiteBlocks.create,
// Courses.create, Modules.create/assignToCourse) — an AI-generated
// academy is a completely ordinary academy afterward, editable through
// every existing admin page (Branding, Academy Site, Courses) with
// nothing special about it.
//
// Reused by two different callers with two different lifecycles:
//  - lib/actions/signup.ts: a brand-new academy, right after it and its
//    first admin account are created (switchTemplate is always true —
//    there's nothing to "switch away from" yet).
//  - lib/actions/aiAcademy.ts: an existing academy's admin using the
//    dashboard's "Generate with AI" tool. Always additive — this never
//    deletes or overwrites existing homepage blocks, courses, or
//    templates; it only adds a new custom template (optionally switching
//    to it) plus new homepage blocks and new courses/modules.
import { Templates, Academies, SiteBlocks, Courses, Modules } from "@/lib/queries";
import type { AcademyPlan } from "@/lib/ai";

export interface ApplyAcademyPlanResult {
  templateId: string;
  templateApplied: boolean;
  blockCount: number;
  courseCount: number;
  moduleCount: number;
}

export async function applyAcademyPlan(input: {
  academyId: string;
  createdByUserId: string;
  plan: AcademyPlan;
  switchTemplate: boolean;
}): Promise<ApplyAcademyPlanResult> {
  const { academyId, createdByUserId, plan, switchTemplate } = input;

  const template = await Templates.createCustom({
    academy_id: academyId,
    name: plan.template.name,
    description: plan.template.description,
    primary_color: plan.template.primary_color,
    secondary_color: plan.template.secondary_color,
    accent_color: plan.template.accent_color,
    font_heading: plan.template.font_heading,
  });

  // One combined update: switching template_id (if requested) and the
  // homepage copy (always) together rather than two separate writes.
  await Academies.update(academyId, {
    ...(switchTemplate ? { template_id: template.id } : {}),
    hero_headline: plan.heroHeadline,
    hero_tagline: plan.heroTagline,
    about_text: plan.aboutText,
  });

  for (const block of plan.homepageBlocks) {
    await SiteBlocks.create({
      academy_id: academyId,
      block_type: block.block_type,
      title: block.title,
      body_text: block.body_text,
    });
  }

  let moduleCount = 0;
  for (const course of plan.courses) {
    const createdCourse = await Courses.create({
      academy_id: academyId,
      created_by: createdByUserId,
      title: course.title,
      description: course.description,
      category: course.category,
      price_pence: 0,
      cover_emoji: "📘",
    });

    let orderIndex = 0;
    for (const mod of course.modules) {
      const createdModule = await Modules.create({
        academy_id: academyId,
        created_by: createdByUserId,
        title: mod.title,
        description: mod.description,
        content_type: "TEXT",
        content_text: `Draft outline — replace with your real lesson content:\n\n${mod.description}`,
      });
      await Modules.assignToCourse(createdCourse.id, createdModule.id, orderIndex++);
      moduleCount++;
    }
  }

  return {
    templateId: template.id,
    templateApplied: switchTemplate,
    blockCount: plan.homepageBlocks.length,
    courseCount: plan.courses.length,
    moduleCount,
  };
}
