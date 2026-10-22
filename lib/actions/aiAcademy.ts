"use server";

import { revalidatePath } from "next/cache";
import { generateAcademyPlan, isAiConfigured, sanitizeAcademyPlan, type AcademyPlan } from "@/lib/ai";
import { queueAcademyPlan } from "@/lib/aiAcademyPlan";
import { runBuildStep, buildProgress, retryFailedJobs, type BuildProgress } from "@/lib/aiBuildJobs";
import { requireTenantSession } from "@/lib/authz";
import { isAiTimeout } from "@/lib/aiErrors";
import { withAiMeter, isAiLimitError, aiLimitMessage, allowPublicAiCall } from "@/lib/aiUsage";
import { headers } from "next/headers";

export type AiPlanState = { plan?: AcademyPlan; error?: string } | undefined;

const NOT_CONFIGURED_MESSAGE =
  "AI generation isn't set up yet on this platform — the platform administrator needs to add an Anthropic API key first.";

const TIMEOUT_MESSAGE =
  "That took too long to generate. Try a shorter description (or ask for fewer courses), or fill in the details manually below.";

function readPrompt(formData: FormData): { prompt?: string; error?: string } {
  const prompt = String(formData.get("prompt") || "").trim();
  if (!prompt) return { error: "Describe your academy first." };
  if (prompt.length > 2000) return { error: "That's a lot of detail — try a couple of sentences instead." };
  return { prompt };
}

// Public — called from the /signup wizard before any account exists, so
// deliberately takes no session/auth. Nothing here writes to the
// database; it only calls the AI and returns a plan for the wizard to
// preview. Real rows are only ever created once the admin actually
// submits the sign-up form (see lib/actions/signup.ts).
export async function generateSignupAcademyPlan(_prevState: AiPlanState, formData: FormData): Promise<AiPlanState> {
  const { prompt, error } = readPrompt(formData);
  if (error) return { error };
  if (!isAiConfigured()) return { error: NOT_CONFIGURED_MESSAGE };
  // No academy exists yet, so the preview is limited per visitor instead of
  // per plan (a few tries an hour is plenty for choosing a starting point).
  const hdrs = await headers();
  const ip = hdrs.get("x-nf-client-connection-ip") || (hdrs.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  if (!(await allowPublicAiCall(ip))) {
    return { error: "You've tried the AI preview a few times already — please wait a little while, or fill in the details manually below." };
  }
  try {
    const plan = await generateAcademyPlan(prompt!);
    return { plan };
  } catch (err) {
    console.error("[ai] generateSignupAcademyPlan failed:", err);
    if (isAiTimeout(err)) return { error: TIMEOUT_MESSAGE };
    return { error: "Couldn't generate a plan right now. Please try again, or fill in the details manually below." };
  }
}

// Tenant-scoped — an existing academy admin using the dashboard's
// "Generate with AI" tool to propose more branding/homepage/course
// content. Also only generates and previews; nothing is written until
// applyAcademyUpdatePlan below is submitted.
export async function generateAcademyUpdatePlan(slug: string, _prevState: AiPlanState, formData: FormData): Promise<AiPlanState> {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const { prompt, error } = readPrompt(formData);
  if (error) return { error };
  if (!isAiConfigured()) return { error: NOT_CONFIGURED_MESSAGE };
  try {
    const plan = await withAiMeter(
      { academyId: session.academyId!, userId: session.userId, source: "generate", label: "Academy plan" },
      () => generateAcademyPlan(prompt!)
    );
    return { plan };
  } catch (err) {
    if (isAiLimitError(err)) return { error: aiLimitMessage(err) };
    console.error(`[ai] generateAcademyUpdatePlan failed for academy slug ${slug}:`, err);
    if (isAiTimeout(err)) return { error: TIMEOUT_MESSAGE };
    return { error: "Couldn't generate a plan right now. Please try again shortly." };
  }
}

export type ApplyPlanState =
  | { error?: string; success?: true; courseCount?: number; blockCount?: number; moduleCount?: number }
  | undefined;

// Applies a previously-generated (and admin-reviewed) plan to an existing
// academy. The plan arrives back as a hidden JSON form field rather than
// being re-fetched from anywhere server-side, since the admin may have
// looked at it and decided to proceed — but it's re-sanitised here from
// scratch (never trusted just because it round-tripped through our own
// earlier response) in case the form was tampered with or the JSON is
// malformed. Always additive: creates a new custom template and new
// homepage blocks/courses, never deletes or overwrites anything existing.
//
// This only saves the structure (fast) and queues each module as a build job;
// the browser then calls runPlanBuildStep repeatedly, one short request per
// module, so no single request runs into Netlify's ~30 second limit.
export async function applyAcademyUpdatePlan(slug: string, _prevState: ApplyPlanState, formData: FormData): Promise<ApplyPlanState> {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const raw = String(formData.get("plan") || "");
  const switchTemplate = formData.get("switchTemplate") === "on";

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "That plan looks corrupted — try generating again." };
  }
  const plan = sanitizeAcademyPlan(parsed);
  if (!plan) {
    return { error: "That plan looks invalid — try generating again." };
  }

  try {
    const result = await queueAcademyPlan({ academyId: session.academyId!, createdByUserId: session.userId, plan, switchTemplate });
    revalidatePath(`/a/${slug}/admin`, "layout");
    revalidatePath(`/a/${slug}`, "layout");
    return { success: true, courseCount: result.courseCount, blockCount: result.blockCount, moduleCount: result.jobCount };
  } catch (err) {
    console.error(`[ai] applyAcademyUpdatePlan failed for academy slug ${slug}:`, err);
    return { error: "Couldn't add this to your academy right now. Please try again." };
  }
}

export type BuildStepResult = { progress?: BuildProgress; error?: string };

/** Current progress of the academy's latest build (no work is done). */
export async function getPlanBuildProgress(slug: string): Promise<BuildStepResult> {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  return { progress: await buildProgress(session.academyId!) };
}

/**
 * Builds the next queued module (one short step) and returns the progress.
 * Each module's AI calls are counted against the academy's monthly AI cap;
 * once it is reached the remaining modules fall back to text drafts.
 */
export async function runPlanBuildStep(slug: string, retry = false): Promise<BuildStepResult> {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const academyId = session.academyId!;
  try {
    if (retry) await retryFailedJobs(academyId);
    const progress = await withAiMeter({ academyId, userId: session.userId, source: "generate", label: "Build modules" }, () => runBuildStep(academyId));
    if (progress.ranJobs > 0) {
      revalidatePath(`/a/${slug}/admin`, "layout");
      revalidatePath(`/a/${slug}`, "layout");
    }
    return { progress };
  } catch (err) {
    console.error(`[ai] runPlanBuildStep failed for academy slug ${slug}:`, err);
    return { error: "That step didn't finish. It will be tried again." };
  }
}
