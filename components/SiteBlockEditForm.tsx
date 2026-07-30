"use client";

import type { SiteBlock } from "@/lib/queries";

export default function SiteBlockEditForm({
  action,
  block,
}: {
  action: (formData: FormData) => void | Promise<void>;
  block: SiteBlock;
}) {
  return (
    <form action={action} className="grid gap-4 mt-4 pt-4 border-t border-gray-100">
      <input type="hidden" name="blockId" value={block.id} />
      <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
        Title
        <input name="title" required defaultValue={block.title} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
      </label>

      {(block.block_type === "TEXT" || block.block_type === "NEWS") && (
        <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
          {block.block_type === "NEWS" ? "Story" : "Text content"}
          <textarea
            name="body_text"
            rows={5}
            defaultValue={block.body_text || ""}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
      )}
      {block.block_type === "IMAGE" && (
        <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
          Caption (optional)
          <input name="body_text" defaultValue={block.body_text || ""} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </label>
      )}
      {block.block_type === "VIDEO" && (
        <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
          Description (optional)
          <input name="body_text" defaultValue={block.body_text || ""} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </label>
      )}

      {(block.block_type === "IMAGE" || block.block_type === "NEWS") && (
        <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
          Replace image (leave blank to keep the current one)
          <input
            name="image"
            type="file"
            accept="image/*"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs"
          />
        </label>
      )}
      {block.block_type === "VIDEO" && (
        <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
          Video link
          <input
            name="video_url"
            type="url"
            required
            defaultValue={block.video_url || ""}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
      )}

      <div>
        <button type="submit" className="app-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold">
          Save changes
        </button>
      </div>
    </form>
  );
}
