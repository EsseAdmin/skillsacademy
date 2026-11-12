"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdminSession } from "@/lib/authz";
import { MarketingPages } from "@/lib/queries";
import { saveFile } from "@/lib/storage";
import { sniffImageExtension } from "@/lib/imageSniff";
import { isAiConfigured } from "@/lib/ai";
import { isAiTimeout } from "@/lib/aiErrors";
import { newId } from "@/lib/db";
import { proposeRewrite, drawPageImage, MarketingAiError } from "@/lib/aiMarketing";
import { DEFAULT_HOME_PAGE, parsePage, safeColor, sanitizePage, sanitizeSection, type HomePage, type Section } from "@/lib/marketingPage";

// Every action here is for the platform's super admin only (requireSuperAdminSession
// redirects anyone else to the platform login). Pages travel as JSON text and are
// rebuilt by sanitizePage(), so nothing the browser sends is trusted as-is.

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export type SaveResult = { ok: true; page: HomePage; savedAt: string } | { ok: false; error: string };
export type ImageResult = { ok: true; key: string } | { ok: false; error: string };
export type RewriteResult = { ok: true; section: Section } | { ok: false; error: string };

function revalidateSite() {
  revalidatePath("/", "layout");
  revalidatePath("/super-admin/home-editor");
}

function parseSent(json: string): HomePage | null {
  try {
    return sanitizePage(JSON.parse(json));
  } catch {
    return null;
  }
}

export async function saveHomeDraft(json: string): Promise<SaveResult> {
  const session = await requireSuperAdminSession();
  const page = parseSent(json);
  if (!page || page.sections.length === 0) return { ok: false, error: "The page needs at least one section." };
  await MarketingPages.saveDraft(JSON.stringify(page), session.userId);
  revalidatePath("/super-admin/home-editor");
  return { ok: true, page, savedAt: new Date().toISOString() };
}

/** Saves what is on screen, then makes it the live page. */
export async function publishHome(json: string): Promise<SaveResult> {
  const session = await requireSuperAdminSession();
  const page = parseSent(json);
  if (!page || page.sections.length === 0) return { ok: false, error: "The page needs at least one section." };
  if (!page.sections.some((s) => s.visible)) return { ok: false, error: "Show at least one section before publishing." };
  await MarketingPages.publish(JSON.stringify(page), session.userId);
  revalidateSite();
  return { ok: true, page, savedAt: new Date().toISOString() };
}

/** Drops the draft: the editor goes back to what is live. */
export async function discardHomeDraft(): Promise<SaveResult> {
  await requireSuperAdminSession();
  await MarketingPages.discardDraft();
  const row = await MarketingPages.get();
  revalidatePath("/super-admin/home-editor");
  return { ok: true, page: parsePage(row?.published_json), savedAt: new Date().toISOString() };
}

/** Puts the original built-in design into the draft (it is not live until published). */
export async function resetHomeDraftToOriginal(): Promise<SaveResult> {
  const session = await requireSuperAdminSession();
  const page = structuredClone(DEFAULT_HOME_PAGE);
  await MarketingPages.saveDraft(JSON.stringify(page), session.userId);
  revalidatePath("/super-admin/home-editor");
  return { ok: true, page, savedAt: new Date().toISOString() };
}

/** Brings an earlier published version back as the draft. */
export async function restoreHomeVersion(versionId: string): Promise<SaveResult> {
  const session = await requireSuperAdminSession();
  const v = await MarketingPages.version(String(versionId));
  if (!v) return { ok: false, error: "That version no longer exists." };
  const page = parsePage(v.content_json);
  await MarketingPages.saveDraft(JSON.stringify(page), session.userId);
  revalidatePath("/super-admin/home-editor");
  return { ok: true, page, savedAt: new Date().toISOString() };
}

export async function uploadHomeImage(formData: FormData): Promise<ImageResult> {
  await requireSuperAdminSession();
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a picture first." };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "That picture is over 4MB — please use a smaller one." };
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = sniffImageExtension(buf);
  if (!ext) return { ok: false, error: "Use a PNG, JPG, GIF, WebP or SVG picture." };
  const key = `${newId().slice(0, 18)}.${ext}`;
  await saveFile(`marketing/${key}`, buf);
  return { ok: true, key };
}

function aiError(err: unknown, what: string): string {
  if (err instanceof MarketingAiError) return err.message;
  if (isAiTimeout(err)) return `That took too long. Try ${what} again, or with a shorter request.`;
  console.error(`[home-editor] AI ${what} failed:`, err);
  return `The AI couldn't do that right now. Please try again shortly.`;
}

export async function aiRewriteSection(sectionJson: string, instruction: string): Promise<RewriteResult> {
  await requireSuperAdminSession();
  if (!isAiConfigured()) return { ok: false, error: "AI isn't set up yet on this platform — add an Anthropic API key first." };
  let section: Section | null = null;
  try {
    section = sanitizeSection(JSON.parse(sectionJson));
  } catch {
    /* handled below */
  }
  if (!section) return { ok: false, error: "That section couldn't be read." };
  try {
    return { ok: true, section: await proposeRewrite(section, String(instruction ?? "")) };
  } catch (err) {
    return { ok: false, error: aiError(err, "the rewrite") };
  }
}

export async function aiDrawHomeImage(subject: string, heading: string, navyIn: string, goldIn: string): Promise<ImageResult> {
  await requireSuperAdminSession();
  if (!isAiConfigured()) return { ok: false, error: "AI isn't set up yet on this platform — add an Anthropic API key first." };
  try {
    const navy = safeColor(navyIn, DEFAULT_HOME_PAGE.theme.navy);
    const gold = safeColor(goldIn, DEFAULT_HOME_PAGE.theme.gold);
    const svg = await drawPageImage({ subject: String(subject ?? ""), heading: String(heading ?? ""), navy, gold });
    const key = `${newId().slice(0, 18)}.svg`;
    await saveFile(`marketing/${key}`, Buffer.from(svg, "utf8"));
    return { ok: true, key };
  } catch (err) {
    return { ok: false, error: aiError(err, "the picture") };
  }
}
