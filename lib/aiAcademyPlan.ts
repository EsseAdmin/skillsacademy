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
import { buildModulePack, mapWithConcurrency, type ContentProvider } from "@/lib/aiModuleBuild";

// Applying a plan runs inside one serverless request (60s limit on
// Netlify), and each rich module (PowerPoint / Word / SCORM / video script)
// needs its own AI call — so all of them share this overall time budget and
// run a few at a time. A module whose call wouldn't fit simply becomes a
// text draft (see lib/aiModuleBuild.ts), never an error. Concurrency matches
// the 8-file cap in lib/ai.ts so a full plan is a single wave of AI calls.
const APPLY_BUDGET_MS = 42_000;
const MODULE_CONCURRENCY = 8;

export interface ApplyAcademyPlanResult {
  templateId: string;
  templateApplied: boolean;
  blockCount: number;
  courseCount: number;
  moduleCount: number;
  // Modules created as real PowerPoint / Word / SCORM / video / link
  // content, and how many planned rich modules had to fall back to a text
  // draft instead (no API key, timeout, invalid AI response…).
  richModuleCount: number;
  fallbackCount: number;
}

export async function applyAcademyPlan(input: {
  academyId: string;
  createdByUserId: string;
  plan: AcademyPlan;
  switchTemplate: boolean;
  // Test hook: replaces the Anthropic-backed content writer.
  provider?: ContentProvider;
  budgetMs?: number;
}): Promise<ApplyAcademyPlanResult> {
  const { academyId, createdByUserId, plan, switchTemplate } = input;
  const deadline = Date.now() + (input.budgetMs ?? APPLY_BUDGET_MS);
  const academy = await Academies.byId(academyId);
  const academyName = academy?.name || plan.academyName;

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
  let richModuleCount = 0;
  let fallbackCount = 0;

  // Create every course first, then build the modules of ALL courses in one
  // pool (each rich module is an AI call, and a PowerPoint also writes its
  // Word exercise sheet alongside). One pool rather than course by course so
  // the whole plan takes about as long as the slowest single call, which is
  // what keeps it inside the serverless time limit.
  const createdCourses = [];
  for (const course of plan.courses) {
    createdCourses.push(
      await Courses.create({
        academy_id: academyId,
        created_by: createdByUserId,
        title: course.title,
        description: course.description,
        category: course.category,
        price_pence: 0,
        cover_emoji: "📘",
      })
    );
  }
  const jobs = plan.courses.flatMap((course, courseIndex) => course.modules.map((mod) => ({ course, courseIndex, mod })));
  const packs = await mapWithConcurrency(jobs, MODULE_CONCURRENCY, ({ course, mod }) =>
    buildModulePack(mod, {
      academyId,
      createdByUserId,
      academyName,
      courseTitle: course.title,
      courseDescription: course.description,
      primaryColor: plan.template.primary_color,
      accentColor: plan.template.accent_color,
      deadline,
      provider: input.provider,
    })
  );

  // Attach in the planned order: each course's modules, deck then exercises.
  const nextOrder = new Array<number>(createdCourses.length).fill(0);
  for (let i = 0; i < jobs.length; i++) {
    const { courseIndex } = jobs[i];
    for (const result of packs[i].results) {
      await Modules.assignToCourse(createdCourses[courseIndex].id, result.module.id, nextOrder[courseIndex]++);
      moduleCount++;
      if (result.fellBack) fallbackCount++;
      else if (result.kind !== "TEXT") richModuleCount++;
    }
    fallbackCount += packs[i].skippedExercises;
  }

  return {
    templateId: template.id,
    templateApplied: switchTemplate,
    blockCount: plan.homepageBlocks.length,
    courseCount: plan.courses.length,
    moduleCount,
    richModuleCount,
    fallbackCount,
  };
}
