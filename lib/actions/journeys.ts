"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTenantSession } from "@/lib/authz";
import type { SessionPayload } from "@/lib/auth";
import { Journeys } from "@/lib/journeys";
import { sanitizeJourneyDoc, JOURNEY_LIMITS } from "@/lib/journeyTypes";
import { ensureJourneysOnDesignedPage } from "@/lib/academyPageContent";
import { Academies } from "@/lib/queries";
import { agentCoursesFor, agentModulesFor } from "@/lib/aiAgent";

// Academy admins and instructors both build learning journeys. An admin can open
// any journey in their academy; an instructor only the ones they created, and
// only link courses and modules they own or teach.

const MAX_JOURNEYS = 25;

export type SaveJourneyState = { error?: string; success?: true; notices?: string[] } | undefined;

// When a journey goes on the home page, make sure a designed home page has a place for it.
async function showOnDesignedPage(slug: string, userId: string): Promise<boolean> {
  const academy = await Academies.bySlug(slug);
  return academy ? ensureJourneysOnDesignedPage(academy, userId) : false;
}

function areaOf(session: SessionPayload): "admin" | "instructor" {
  return session.role === "ACADEMY_ADMIN" ? "admin" : "instructor";
}

async function ownJourney(session: SessionPayload, id: string) {
  const row = await Journeys.byId(id);
  if (!row || row.academy_id !== session.academyId) return undefined;
  if (session.role !== "ACADEMY_ADMIN" && row.created_by !== session.userId) return undefined;
  return row;
}

export async function createJourney(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const area = areaOf(session);
  const title = String(formData.get("title") || "").replace(/\s+/g, " ").trim().slice(0, JOURNEY_LIMITS.title);
  if (!title) redirect(`/a/${slug}/${area}/journeys?error=title`);
  if ((await Journeys.list(session.academyId!)).length >= MAX_JOURNEYS) redirect(`/a/${slug}/${area}/journeys?error=limit`);
  const id = await Journeys.create(session.academyId!, session.userId, title);
  revalidatePath(`/a/${slug}/${area}/journeys`);
  redirect(`/a/${slug}/${area}/journeys/${id}`);
}

export async function saveJourney(slug: string, journeyId: string, payload: string): Promise<SaveJourneyState> {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const row = await ownJourney(session, journeyId);
  if (!row) return { error: "That journey wasn't found." };

  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    return { error: "That journey couldn't be read — please try saving again." };
  }
  const result = sanitizeJourneyDoc(raw);
  if (!result.doc) return { error: result.error };
  const doc = result.doc;

  // A station may only point at a course or module this person can use in this academy.
  const courseIds = new Set((await agentCoursesFor(session)).map((c) => c.id));
  const moduleIds = new Set((await agentModulesFor(session)).map((m) => m.id));
  for (const s of doc.stations) {
    if (s.kind === "COURSE" && !courseIds.has(s.courseId!)) return { error: `"${s.title}" links to a course you can't use here — pick another.` };
    if (s.kind === "MODULE" && !moduleIds.has(s.moduleId!)) return { error: `"${s.title}" links to a module you can't use here — pick another.` };
  }

  await Journeys.save(journeyId, doc);
  const notices: string[] = [];
  if (doc.published) {
    if (await showOnDesignedPage(slug, session.userId)) notices.push("Your designed home page had no learning-journeys block, so one was added after your course list.");
    const academy = await Academies.bySlug(slug);
    if (academy && !academy.is_published) notices.push("Your academy's public site isn't published yet - publish it from Academy Site for visitors to see this journey.");
    if (!Object.values(doc.stops).some((s) => s.length > 0)) notices.push("No station has been placed on a pathway yet, so the map is not shown until you add one.");
  }
  revalidatePath(`/a/${slug}`);
  revalidatePath(`/a/${slug}/${areaOf(session)}/journeys`);
  revalidatePath(`/a/${slug}/admin/site`);
  return { success: true, notices };
}

// One-click "Add to home page" / "Remove from home page" from the journeys list.
export async function setJourneyOnHomePage(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const id = String(formData.get("journeyId") || "");
  const show = String(formData.get("show") || "") === "1";
  if (await ownJourney(session, id)) {
    await Journeys.setPublished(id, show);
    if (show) await showOnDesignedPage(slug, session.userId);
  }
  revalidatePath(`/a/${slug}`);
  revalidatePath(`/a/${slug}/${areaOf(session)}/journeys`);
  revalidatePath(`/a/${slug}/admin/site`);
}

export async function deleteJourney(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const id = String(formData.get("journeyId") || "");
  if (await ownJourney(session, id)) await Journeys.remove(id);
  revalidatePath(`/a/${slug}`);
  revalidatePath(`/a/${slug}/${areaOf(session)}/journeys`);
}
