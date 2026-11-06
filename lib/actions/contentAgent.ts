"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantSession } from "@/lib/authz";
import { isAiConfigured } from "@/lib/ai";
import { isAiTimeout } from "@/lib/aiErrors";
import { isAiLimitError, aiLimitMessage, getAiUsage, withAiMeter } from "@/lib/aiUsage";
import { approveDraft, rejectDraft, restoreDraft, isAgentError } from "@/lib/aiAgent";
import { startAgentRequest, isContentAgentError, type AgentStartResult } from "@/lib/contentAgent";

export type AgentRequestState = { error?: string; result?: AgentStartResult } | undefined;

const ROLES = ["ACADEMY_ADMIN", "INSTRUCTOR"] as const;

function areaOf(role: string): "admin" | "instructor" {
  return role === "ACADEMY_ADMIN" ? "admin" : "instructor";
}

function pageUrl(slug: string, role: string, query = ""): string {
  return `/a/${slug}/${areaOf(role)}/content-agent${query}`;
}

// The content agent's one prompt: plans which modules to create for which
// course and queues them (the browser then builds them one short step at a time
// through runPlanBuildStep). Nothing is created here except the queue; the
// planning call itself counts as one AI action.
export async function startContentAgent(slug: string, _prev: AgentRequestState, formData: FormData): Promise<AgentRequestState> {
  const session = await requireTenantSession(slug, [...ROLES]);
  if (!isAiConfigured()) {
    return { error: "AI isn't set up yet on this platform — the platform administrator needs to add an Anthropic API key first." };
  }
  try {
    const usage = await getAiUsage(session.academyId!);
    if (usage.remaining <= 0) {
      return { error: `Your academy has used all ${usage.limit} AI actions included in its ${usage.planName} plan this month. The allowance resets on ${new Date(usage.resetsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })} — or upgrade your plan for more.` };
    }
    const result = await withAiMeter({ academyId: session.academyId!, userId: session.userId, source: "agent", label: "Content agent: plan modules" }, () =>
      startAgentRequest(session, { prompt: String(formData.get("prompt") || ""), courseId: String(formData.get("courseId") || "") || undefined })
    );
    revalidatePath(pageUrl(slug, session.role));
    return { result };
  } catch (err) {
    if (isContentAgentError(err)) return { error: err.message };
    if (isAiLimitError(err)) return { error: aiLimitMessage(err) };
    if (isAiTimeout(err)) return { error: "That took too long to plan. Try a shorter request, or ask for fewer modules at a time." };
    console.error(`[agent] request failed for academy ${slug}:`, err);
    return { error: "The agent couldn't plan that right now. Please try again shortly." };
  }
}

async function decide(slug: string, formData: FormData, what: "approve" | "reject" | "restore"): Promise<never> {
  const session = await requireTenantSession(slug, [...ROLES]);
  const draftId = String(formData.get("draftId") || "");
  let query = "";
  try {
    if (what === "approve") {
      await approveDraft(session, draftId);
      query = "?done=approved";
    } else if (what === "reject") {
      await rejectDraft(session, draftId);
      query = "?done=rejected";
    } else {
      await restoreDraft(session, draftId);
      query = "?done=restored";
    }
    revalidatePath(`/a/${slug}`, "layout");
  } catch (err) {
    if (isAgentError(err)) query = `?error=${encodeURIComponent(err.message)}`;
    else {
      console.error(`[agent] ${what} failed for academy ${slug}:`, err);
      query = `?error=${encodeURIComponent("Something went wrong applying that. Nothing was changed — please try again.")}`;
    }
  }
  redirect(pageUrl(slug, session.role, query));
}

export async function approveAgentDraft(slug: string, formData: FormData): Promise<void> {
  await decide(slug, formData, "approve");
}
export async function rejectAgentDraft(slug: string, formData: FormData): Promise<void> {
  await decide(slug, formData, "reject");
}
export async function restoreAgentDraft(slug: string, formData: FormData): Promise<void> {
  await decide(slug, formData, "restore");
}
