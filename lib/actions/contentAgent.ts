"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantSession } from "@/lib/authz";
import { isAiConfigured } from "@/lib/ai";
import { isAiTimeout } from "@/lib/aiErrors";
import { isAiLimitError, aiLimitMessage, getAiUsage } from "@/lib/aiUsage";
import {
  requestDraft,
  approveDraft,
  rejectDraft,
  restoreDraft,
  isAgentError,
  AGENT_ACTIONS,
  AGENT_KINDS,
  type AgentAction,
  type AgentKind,
} from "@/lib/aiAgent";

export type AgentRequestState = { error?: string; draftId?: string } | undefined;

const ROLES = ["ACADEMY_ADMIN", "INSTRUCTOR"] as const;

function areaOf(role: string): "admin" | "instructor" {
  return role === "ACADEMY_ADMIN" ? "admin" : "instructor";
}

function pageUrl(slug: string, role: string, query = ""): string {
  return `/a/${slug}/${areaOf(role)}/content-agent${query}`;
}

// Asks the agent for a draft. Only ever creates a PENDING draft — nothing in
// the academy changes until someone approves it (approveAgentDraft below).
export async function requestAgentDraft(slug: string, _prev: AgentRequestState, formData: FormData): Promise<AgentRequestState> {
  const session = await requireTenantSession(slug, [...ROLES]);
  if (!isAiConfigured()) {
    return { error: "AI isn't set up yet on this platform — the platform administrator needs to add an Anthropic API key first." };
  }
  const action = String(formData.get("action") || "") as AgentAction;
  const kindRaw = String(formData.get("kind") || "");
  try {
    // Refuse before doing any work when the month's allowance is already gone.
    const usage = await getAiUsage(session.academyId!);
    if (usage.remaining <= 0) {
      return { error: `Your academy has used all ${usage.limit} AI actions included in its ${usage.planName} plan this month. The allowance resets on ${new Date(usage.resetsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })} — or upgrade your plan for more.` };
    }
    const draft = await requestDraft(session, {
      action: AGENT_ACTIONS.includes(action) ? action : ("" as AgentAction),
      instruction: String(formData.get("instruction") || ""),
      moduleId: String(formData.get("moduleId") || "") || undefined,
      courseId: String(formData.get("courseId") || "") || undefined,
      kind: AGENT_KINDS.includes(kindRaw as AgentKind) ? (kindRaw as AgentKind) : undefined,
      title: String(formData.get("title") || "") || undefined,
    });
    revalidatePath(pageUrl(slug, session.role));
    return { draftId: draft.id };
  } catch (err) {
    if (isAgentError(err)) return { error: err.message };
    if (isAiLimitError(err)) return { error: aiLimitMessage(err) };
    if (isAiTimeout(err)) return { error: "That took too long. Try a shorter or simpler request." };
    console.error(`[agent] request failed for academy ${slug}:`, err);
    return { error: "The agent couldn't write a draft right now. Please try again shortly." };
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
