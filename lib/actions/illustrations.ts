"use server";

import { revalidatePath } from "next/cache";
import { requireTenantSession } from "@/lib/authz";
import { Courses, Modules } from "@/lib/queries";
import { isAiConfigured } from "@/lib/ai";
import { withAiMeter, isAiLimitError, aiLimitMessage } from "@/lib/aiUsage";
import { isAiTimeout } from "@/lib/aiErrors";
import { illustrateCourse, illustrateModule } from "@/lib/illustrationStore";

export type IllustrationState = { error?: string; success?: true } | undefined;

const NOT_CONFIGURED = "AI pictures aren't set up yet on this platform — the platform administrator needs to add an Anthropic API key first.";
// A server action has to answer inside Netlify's ~30 seconds.
const TIMEOUT_MS = 22_000;

function explain(err: unknown): string {
  if (isAiLimitError(err)) return aiLimitMessage(err);
  if (isAiTimeout(err)) return "The picture took too long to design. Please try again.";
  console.error("[ai] illustration failed:", err);
  return "Couldn't design a picture right now. Please try again, or upload your own.";
}

// "Design a picture with AI" on a course's page. Replaces the current cover.
export async function generateCourseIllustration(slug: string, _prev: IllustrationState, formData: FormData): Promise<IllustrationState> {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const course = await Courses.byId(String(formData.get("courseId") || ""));
  if (!course || course.academy_id !== session.academyId) return { error: "Course not found." };
  if (!isAiConfigured()) return { error: NOT_CONFIGURED };
  try {
    await withAiMeter({ academyId: session.academyId!, userId: session.userId, source: "generate", label: "Course picture" }, () =>
      illustrateCourse(course.id, { timeoutMs: TIMEOUT_MS })
    );
  } catch (err) {
    return { error: explain(err) };
  }
  for (const area of ["admin", "instructor"]) revalidatePath(`/a/${slug}/${area}/courses/${course.id}`);
  revalidatePath(`/a/${slug}/courses/${course.id}`);
  revalidatePath(`/a/${slug}`);
  revalidatePath(`/a/${slug}/learner/catalog`);
  return { success: true };
}

// "Design a picture with AI" on a module in the Modules Library.
export async function generateModuleIllustration(slug: string, _prev: IllustrationState, formData: FormData): Promise<IllustrationState> {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const mod = await Modules.byId(String(formData.get("moduleId") || ""));
  if (!mod || mod.academy_id !== session.academyId) return { error: "Module not found." };
  if (!isAiConfigured()) return { error: NOT_CONFIGURED };
  try {
    await withAiMeter({ academyId: session.academyId!, userId: session.userId, source: "generate", label: "Module picture" }, () =>
      illustrateModule(mod.id, { timeoutMs: TIMEOUT_MS })
    );
  } catch (err) {
    return { error: explain(err) };
  }
  const area = session.role === "ACADEMY_ADMIN" ? "admin" : "instructor";
  revalidatePath(`/a/${slug}/${area}/modules`);
  revalidatePath(`/a/${slug}/courses`, "layout");
  revalidatePath(`/a/${slug}/learner/courses`, "layout");
  return { success: true };
}
