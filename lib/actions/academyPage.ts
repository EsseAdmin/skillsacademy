"use server";

import { revalidatePath } from "next/cache";
import { requireTenantSession } from "@/lib/authz";
import { Academies, AcademyPages, Templates } from "@/lib/queries";
import { saveFile } from "@/lib/storage";
import { sniffImageExtension } from "@/lib/imageSniff";
import { isAiConfigured } from "@/lib/ai";
import { isAiTimeout } from "@/lib/aiErrors";
import { newId } from "@/lib/db";
import { withAiMeter, isAiLimitError, aiLimitMessage } from "@/lib/aiUsage";
import { proposeAcademyRewrite, drawAcademyImage, AcademyPageAiError } from "@/lib/aiAcademyPage";
import { academyImageStorageKey, buildStartingPage, loadPublishedDesign } from "@/lib/academyPageContent";
import { parseAcademyPage, safeColor, sanitizeAcademyPage, sanitizeAcademySection, type AcademyPage, type AcademySection } from "@/lib/academyPage";

// Every action here is for the academy's own admin only (requireTenantSession checks the
// session belongs to this academy and has the ACADEMY_ADMIN role). Pages travel as JSON text
// and are rebuilt by sanitizeAcademyPage(), so nothing the browser sends is trusted as-is.
// Available on every plan, including during the trial.

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export type DesignSaveResult = { ok: true; page: AcademyPage; savedAt: string } | { ok: false; error: string };
export type DesignImageResult = { ok: true; key: string } | { ok: false; error: string };
export type DesignRewriteResult = { ok: true; section: AcademySection } | { ok: false; error: string };

function parseSent(json: string, slug: string): AcademyPage | null {
  try {
    return sanitizeAcademyPage(JSON.parse(json), slug);
  } catch {
    return null;
  }
}
function revalidateDesigner(slug: string) {
  revalidatePath(`/a/${slug}/admin/designer`);
}
function revalidateSite(slug: string) {
  revalidatePath(`/a/${slug}`);
  revalidateDesigner(slug);
  revalidatePath(`/a/${slug}/admin/site`);
}

export async function saveDesignDraft(slug: string, json: string): Promise<DesignSaveResult> {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const page = parseSent(json, slug);
  if (!page || page.sections.length === 0) return { ok: false, error: "The page needs at least one section." };
  await AcademyPages.saveDraft(session.academyId!, JSON.stringify(page), session.userId);
  revalidateDesigner(slug);
  return { ok: true, page, savedAt: new Date().toISOString() };
}

/** Saves what is on screen, then makes it the page visitors see. */
export async function publishDesign(slug: string, json: string): Promise<DesignSaveResult> {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const page = parseSent(json, slug);
  if (!page || page.sections.length === 0) return { ok: false, error: "The page needs at least one section." };
  if (!page.sections.some((s) => s.visible)) return { ok: false, error: "Show at least one section before publishing." };
  await AcademyPages.publish(session.academyId!, JSON.stringify(page), session.userId);
  revalidateSite(slug);
  return { ok: true, page, savedAt: new Date().toISOString() };
}

/** Drops the draft: the designer goes back to what is live (or to the starting page). */
export async function discardDesignDraft(slug: string): Promise<DesignSaveResult> {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const academy = await Academies.byId(session.academyId!);
  if (!academy) return { ok: false, error: "Academy not found." };
  await AcademyPages.discardDraft(academy.id);
  const live = await loadPublishedDesign(academy);
  const page = live ?? (await buildStartingPage(academy));
  if (!live) await AcademyPages.saveDraft(academy.id, JSON.stringify(page), session.userId);
  revalidateDesigner(slug);
  return { ok: true, page, savedAt: new Date().toISOString() };
}

/** Rebuilds the draft from the academy's headline, tagline and Academy Site sections (not live until published). */
export async function resetDesignToStart(slug: string): Promise<DesignSaveResult> {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const academy = await Academies.byId(session.academyId!);
  if (!academy) return { ok: false, error: "Academy not found." };
  const page = await buildStartingPage(academy);
  await AcademyPages.saveDraft(academy.id, JSON.stringify(page), session.userId);
  revalidateDesigner(slug);
  return { ok: true, page, savedAt: new Date().toISOString() };
}

/** Brings an earlier published version back as the draft. */
export async function restoreDesignVersion(slug: string, versionId: string): Promise<DesignSaveResult> {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const v = await AcademyPages.version(session.academyId!, String(versionId));
  const page = v ? parseAcademyPage(v.content_json, slug) : null;
  if (!v || !page) return { ok: false, error: "That version no longer exists." };
  await AcademyPages.saveDraft(session.academyId!, JSON.stringify(page), session.userId);
  revalidateDesigner(slug);
  return { ok: true, page, savedAt: new Date().toISOString() };
}

/** Takes the designed page down: visitors see the academy's original simple page again. */
export async function unpublishDesign(slug: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  await AcademyPages.unpublish(session.academyId!);
  revalidateSite(slug);
  return { ok: true };
}

export async function uploadDesignImage(slug: string, formData: FormData): Promise<DesignImageResult> {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a picture first." };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "That picture is over 4MB — please use a smaller one." };
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = sniffImageExtension(buf);
  if (!ext) return { ok: false, error: "Use a PNG, JPG, GIF, WebP or SVG picture." };
  const key = `${newId().slice(0, 18)}.${ext}`;
  await saveFile(academyImageStorageKey(session.academyId!, key), buf);
  return { ok: true, key };
}

function aiError(err: unknown, what: string): string {
  if (isAiLimitError(err)) return aiLimitMessage(err);
  if (err instanceof AcademyPageAiError) return err.message;
  if (isAiTimeout(err)) return `That took too long. Try ${what} again, or with a shorter request.`;
  console.error(`[page-designer] AI ${what} failed:`, err);
  return `The AI couldn't do that right now. Please try again shortly.`;
}

export async function aiRewriteDesignSection(slug: string, sectionJson: string, instruction: string): Promise<DesignRewriteResult> {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  if (!isAiConfigured()) return { ok: false, error: "AI isn't set up yet on this platform." };
  const academy = await Academies.byId(session.academyId!);
  if (!academy) return { ok: false, error: "Academy not found." };
  let section: AcademySection | null = null;
  try {
    section = sanitizeAcademySection(JSON.parse(sectionJson), slug);
  } catch {
    /* handled below */
  }
  if (!section) return { ok: false, error: "That section couldn't be read." };
  try {
    const proposal = await withAiMeter({ academyId: academy.id, userId: session.userId, source: "generate", label: "Page rewrite" }, () =>
      proposeAcademyRewrite(section!, String(instruction ?? ""), { slug, academyName: academy.name, language: academy.language })
    );
    return { ok: true, section: proposal };
  } catch (err) {
    return { ok: false, error: aiError(err, "the rewrite") };
  }
}

export async function aiDrawDesignImage(slug: string, subject: string, heading: string, colours: { primary: string; secondary: string; accent: string }): Promise<DesignImageResult> {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  if (!isAiConfigured()) return { ok: false, error: "AI isn't set up yet on this platform." };
  const academy = await Academies.byId(session.academyId!);
  if (!academy) return { ok: false, error: "Academy not found." };
  const template = await Templates.byId(academy.template_id);
  try {
    const primary = safeColor(colours?.primary, template?.primary_color ?? "#1f3a5f");
    const secondary = safeColor(colours?.secondary, template?.secondary_color ?? primary);
    const accent = safeColor(colours?.accent, template?.accent_color ?? "#fbcb07");
    const svg = await withAiMeter({ academyId: academy.id, userId: session.userId, source: "generate", label: "Page picture" }, () =>
      drawAcademyImage({ subject: String(subject ?? ""), heading: String(heading ?? ""), academyName: academy.name, primary, secondary, accent })
    );
    const key = `${newId().slice(0, 18)}.svg`;
    await saveFile(academyImageStorageKey(academy.id, key), Buffer.from(svg, "utf8"));
    return { ok: true, key };
  } catch (err) {
    return { ok: false, error: aiError(err, "the picture") };
  }
}
