"use server";

import { revalidatePath } from "next/cache";
import { SiteBlocks } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { saveFile, deleteFile } from "@/lib/storage";

function validateVideoUrl(raw: string): string {
  const url = raw.trim();
  if (!url) throw new Error("Paste a video link (YouTube, Vimeo, or a direct video file URL).");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("That doesn't look like a valid video link — check the URL and try again.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("The video link must be a secure https:// link.");
  }
  return url;
}

async function storeImage(file: File): Promise<{ path: string }> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storedName = `site-blocks/${crypto.randomUUID()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await saveFile(storedName, buffer);
  return { path: storedName };
}

export async function createSiteBlock(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const blockType = String(formData.get("block_type") || "TEXT") as "TEXT" | "IMAGE" | "VIDEO" | "NEWS";
  const title = String(formData.get("title") || "").trim();
  if (!title) throw new Error("Give this section a title.");

  const body_text: string | null = String(formData.get("body_text") || "").trim() || null;
  let image_path: string | null = null;
  let video_url: string | null = null;

  if (blockType === "IMAGE" || blockType === "NEWS") {
    const file = formData.get("image") as File | null;
    if (file && file.size > 0) {
      image_path = (await storeImage(file)).path;
    } else if (blockType === "IMAGE") {
      throw new Error("Choose an image to upload.");
    }
  }
  if (blockType === "VIDEO") {
    video_url = validateVideoUrl(String(formData.get("video_url") || ""));
  }

  await SiteBlocks.create({
    academy_id: session.academyId!,
    block_type: blockType,
    title,
    body_text,
    image_path,
    video_url,
  });

  revalidatePath(`/a/${slug}/admin/site`);
  revalidatePath(`/a/${slug}`);
}

export async function updateSiteBlock(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const id = String(formData.get("blockId") || "");
  const block = await SiteBlocks.byId(id);
  if (!block || block.academy_id !== session.academyId) return;

  const title = String(formData.get("title") || "").trim();
  if (!title) throw new Error("Give this section a title.");
  const patch: Parameters<typeof SiteBlocks.update>[1] = {
    title,
    body_text: String(formData.get("body_text") || "").trim() || null,
  };

  if (block.block_type === "IMAGE" || block.block_type === "NEWS") {
    const file = formData.get("image") as File | null;
    if (file && file.size > 0) {
      if (block.image_path) await deleteFile(block.image_path);
      patch.image_path = (await storeImage(file)).path;
    }
    // No new image chosen — leave the existing one in place.
  }
  if (block.block_type === "VIDEO") {
    patch.video_url = validateVideoUrl(String(formData.get("video_url") || ""));
  }

  await SiteBlocks.update(id, patch);
  revalidatePath(`/a/${slug}/admin/site`);
  revalidatePath(`/a/${slug}`);
}

export async function toggleSiteBlockPublished(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const id = String(formData.get("blockId") || "");
  const block = await SiteBlocks.byId(id);
  if (!block || block.academy_id !== session.academyId) return;
  await SiteBlocks.update(id, { is_published: !block.is_published });
  revalidatePath(`/a/${slug}/admin/site`);
  revalidatePath(`/a/${slug}`);
}

export async function moveSiteBlock(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const id = String(formData.get("blockId") || "");
  const direction = String(formData.get("direction") || "") as "up" | "down";
  const block = await SiteBlocks.byId(id);
  if (!block || block.academy_id !== session.academyId) return;
  if (direction !== "up" && direction !== "down") return;
  await SiteBlocks.move(id, direction);
  revalidatePath(`/a/${slug}/admin/site`);
  revalidatePath(`/a/${slug}`);
}

export async function deleteSiteBlock(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const id = String(formData.get("blockId") || "");
  const block = await SiteBlocks.byId(id);
  if (!block || block.academy_id !== session.academyId) return;
  if (block.image_path) await deleteFile(block.image_path);
  await SiteBlocks.remove(id);
  revalidatePath(`/a/${slug}/admin/site`);
  revalidatePath(`/a/${slug}`);
}
