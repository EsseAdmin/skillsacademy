import Markup from "@/components/Markup";
import { ModuleFiles } from "@/lib/activityQueries";
import { mediaKindOf, readMedia } from "@/lib/activities";
import { parseVideoUrl } from "@/lib/videoModule";
import type { ModuleRow } from "@/lib/queries";

// Learner-facing body of the simple resources (Page, Text and media area,
// Folder) that are shown inline on the course page.
export default async function ResourceBody({ m }: { m: ModuleRow }) {
  if (m.content_type === "PAGE") {
    return <div className="rounded-md bg-gray-50 p-4"><Markup text={m.content_text || ""} /></div>;
  }
  if (m.content_type === "FOLDER") {
    const files = await ModuleFiles.listByModule(m.id);
    if (files.length === 0) return <span className="text-gray-700">📁 This folder is empty.</span>;
    return (
      <ul className="grid gap-1.5">
        {files.map((f) => (
          <li key={f.id}>
            <a href={`/api/files/${m.id}?file=${f.id}`} className="app-link">📥 {f.file_name}</a>{" "}
            <span className="text-xs text-gray-600">({Math.max(1, Math.round(f.file_size / 1024))} KB)</span>
          </li>
        ))}
      </ul>
    );
  }
  if (m.content_type === "MEDIA") {
    const caption = readMedia(m.config_json).caption;
    const kind = mediaKindOf(m.file_mime);
    const src = `/api/files/${m.id}?inline=1`;
    const parsed = parseVideoUrl(m.content_url);
    return (
      <div className="grid gap-3">
        {caption && <div className="rounded-md bg-gray-50 p-4"><Markup text={caption} /></div>}
        {m.file_path && kind === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={m.title} className="max-h-[70vh] max-w-full rounded-md border border-gray-200" />
        )}
        {m.file_path && kind === "audio" && <audio controls preload="metadata" src={src} className="w-full" />}
        {m.file_path && kind === "video" && <video controls preload="metadata" src={src} className="w-full max-h-[70vh] rounded-md bg-black" />}
        {!m.file_path && parsed && parsed.kind !== "file" && (
          <div className="relative w-full overflow-hidden rounded-md bg-black" style={{ aspectRatio: "16 / 9" }}>
            <iframe src={parsed.embedUrl} title={m.title} className="absolute inset-0 h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
          </div>
        )}
        {!m.file_path && parsed && parsed.kind === "file" && <video controls preload="metadata" src={parsed.embedUrl} className="w-full max-h-[70vh] rounded-md bg-black" />}
        {!m.file_path && !parsed && m.content_url && <a href={m.content_url} target="_blank" rel="noreferrer" className="app-link break-all">Open media ↗</a>}
        {!m.file_path && !m.content_url && !caption && <span className="text-gray-700">🖼️ Nothing has been added here yet.</span>}
      </div>
    );
  }
  return null;
}
