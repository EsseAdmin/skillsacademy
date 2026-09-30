"use client";

import { useState } from "react";

export default function SiteBlockForm({ action }: { action: (formData: FormData) => void | Promise<void> }) {
  const [blockType, setBlockType] = useState<"TEXT" | "IMAGE" | "VIDEO" | "NEWS">("TEXT");

  return (
    <form id="new-site-block-form" action={action} className="grid gap-4">
      <div className="text-xs font-semibold text-gray-600">Section type</div>
      <div className="flex flex-wrap gap-2">
        {(["TEXT", "IMAGE", "VIDEO", "NEWS"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setBlockType(t)}
            className={`px-4 py-2 rounded-md text-xs font-semibold border ${
              blockType === t ? "app-btn-primary border-transparent" : "border-gray-300 text-gray-600"
            }`}
          >
            {t === "TEXT" && "📝 Text section"}
            {t === "IMAGE" && "🖼️ Image"}
            {t === "VIDEO" && "🎬 Video"}
            {t === "NEWS" && "📰 News / announcement"}
          </button>
        ))}
      </div>
      <input type="hidden" name="block_type" value={blockType} />

      <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
        Title
        <input
          name="title"
          required
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          placeholder={blockType === "NEWS" ? "e.g. New cohort starting in March" : "Section title"}
        />
      </label>

      {blockType === "TEXT" && (
        <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
          Text content
          <textarea name="body_text" rows={5} className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="Write the section content here…" />
        </label>
      )}

      {blockType === "IMAGE" && (
        <>
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Image
            <input
              name="image"
              type="file"
              accept="image/*"
              required
              className="rounded-md border border-gray-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs"
            />
          </label>
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Caption (optional)
            <input name="body_text" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </label>
        </>
      )}

      {blockType === "VIDEO" && (
        <>
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Video link
            <input
              name="video_url"
              type="url"
              required
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              placeholder="https://www.youtube.com/watch?v=… or a direct video file link"
            />
          </label>
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Description (optional)
            <input name="body_text" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </label>
        </>
      )}

      {blockType === "NEWS" && (
        <>
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Story
            <textarea name="body_text" rows={5} className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="What's the news?" />
          </label>
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Image (optional)
            <input
              name="image"
              type="file"
              accept="image/*"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs"
            />
          </label>
        </>
      )}

      <div>
        <button type="submit" className="app-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold">
          Add to homepage
        </button>
      </div>
    </form>
  );
}
