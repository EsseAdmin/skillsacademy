// Loads an academy's designed page: the live copy for visitors, and the copy the
// academy admin is working on in the Page designer.
import { AcademyPages, SiteBlocks, type Academy } from "@/lib/queries";
import { readFile, saveFile } from "@/lib/storage";
import { sniffImageExtension } from "@/lib/imageSniff";
import { newId } from "@/lib/db";
import { parseLearnItems } from "@/lib/learnItems";
import { defaultAcademyPage, journeysSectionStatus, parseAcademyPage, withJourneysSection, type AcademyPage, type LegacyBlock } from "@/lib/academyPage";

/** Where a designer picture is stored. Keys are per academy, so one academy can never show another's file. */
export function academyImageStorageKey(academyId: string, key: string): string {
  return `academy-pages/${academyId}/${key}`;
}

/** The academy's live designed page, or null while it still shows its original simple page. */
export async function loadPublishedDesign(academy: Pick<Academy, "id" | "slug">): Promise<AcademyPage | null> {
  const row = await AcademyPages.get(academy.id);
  return parseAcademyPage(row?.published_json, academy.slug);
}

/** Copies a picture of the old Academy Site blocks into the designer's storage; null if it can't be read. */
async function copyLegacyImage(academyId: string, path: string | null): Promise<string | null> {
  if (!path) return null;
  try {
    const buf = await readFile(path);
    if (!buf) return null;
    const ext = sniffImageExtension(buf);
    if (!ext) return null;
    const key = `${newId().slice(0, 18)}.${ext}`;
    await saveFile(academyImageStorageKey(academyId, key), buf);
    return key;
  } catch {
    return null;
  }
}

/** The page built from what the academy has today: its headline, tagline and custom blocks, courses and journeys. */
export async function buildStartingPage(academy: Academy): Promise<AcademyPage> {
  const blocks = await SiteBlocks.listByAcademy(academy.id);
  const legacy: LegacyBlock[] = [];
  for (const b of blocks) {
    legacy.push({
      type: b.block_type,
      title: b.title,
      body: b.body_text ?? "",
      videoUrl: b.video_url,
      imageKey: b.block_type === "IMAGE" || b.block_type === "NEWS" ? await copyLegacyImage(academy.id, b.image_path) : null,
      published: !!b.is_published,
      createdAt: b.created_at,
      points: b.block_type === "LEARN" ? parseLearnItems(b.body_text) : undefined,
    });
  }
  return defaultAcademyPage({ slug: academy.slug, name: academy.name, headline: academy.hero_headline, tagline: academy.hero_tagline, blocks: legacy });
}

export interface DesignerState {
  page: AcademyPage;
  /** An unpublished draft exists (as opposed to showing what is live). */
  hasDraft: boolean;
  /** The designed page is live. */
  isLive: boolean;
  publishedAt: string | null;
}

/** What the designer opens with: the saved draft, else the live page, else a page built from the academy's current content (saved as the first draft). */
export async function loadDesignerState(academy: Academy, userId: string): Promise<DesignerState> {
  const row = await AcademyPages.get(academy.id);
  const draft = parseAcademyPage(row?.draft_json, academy.slug);
  const live = parseAcademyPage(row?.published_json, academy.slug);
  if (draft) return { page: draft, hasDraft: true, isLive: !!live, publishedAt: row?.published_at ?? null };
  if (live) return { page: live, hasDraft: false, isLive: true, publishedAt: row?.published_at ?? null };
  const page = await buildStartingPage(academy);
  await AcademyPages.saveDraft(academy.id, JSON.stringify(page), userId);
  return { page, hasDraft: true, isLive: false, publishedAt: null };
}

/** The draft shown in the designer's preview (falls back to the live page, then the starting page, without saving). */
export async function loadDraftForPreview(academy: Academy): Promise<AcademyPage> {
  const row = await AcademyPages.get(academy.id);
  return parseAcademyPage(row?.draft_json, academy.slug) ?? parseAcademyPage(row?.published_json, academy.slug) ?? (await buildStartingPage(academy));
}

/**
 * Called when someone puts a journey on the home page. If the academy's live designed page has no
 * learning-journeys block (or it is hidden), one is added so the journey actually appears; a draft in
 * the designer gets the same block so a later publish doesn't remove it again. Returns true if the live page changed.
 */
export async function ensureJourneysOnDesignedPage(academy: Pick<Academy, "id" | "slug">, userId: string): Promise<boolean> {
  const row = await AcademyPages.get(academy.id);
  const live = parseAcademyPage(row?.published_json, academy.slug);
  const draft = parseAcademyPage(row?.draft_json, academy.slug);
  let changed = false;
  if (draft && journeysSectionStatus(draft) !== "ok") await AcademyPages.saveDraft(academy.id, JSON.stringify(withJourneysSection(draft, academy.slug)), userId);
  if (live && journeysSectionStatus(live) !== "ok") {
    const fixed = withJourneysSection(live, academy.slug);
    if (draft) {
      // A draft exists: update the live copy without discarding the draft.
      await AcademyPages.publishKeepingDraft(academy.id, JSON.stringify(fixed), userId);
    } else {
      await AcademyPages.publish(academy.id, JSON.stringify(fixed), userId);
    }
    changed = true;
  }
  return changed;
}
