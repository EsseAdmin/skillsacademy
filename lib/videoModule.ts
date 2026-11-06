import { safeHttpUrl } from "@/lib/safeUrl";

// Netlify's serverless functions cap request bodies at ~6MB (~4.5MB of
// actual file once base64-encoded), so an uploaded video can't be larger
// than this in production. Anything bigger should be hosted on YouTube /
// Vimeo (or any https .mp4 URL) and pasted as a link instead, which has no
// size limit on our side. (Lives here, not in lib/actions/modules.ts: a
// "use server" file may only export async functions.)
export const MAX_VIDEO_UPLOAD_BYTES = 4 * 1024 * 1024;

// How a VIDEO *module's* pasted link should be shown to a learner. Stricter
// sibling of lib/videoEmbed.ts#resolveVideoEmbed (which serves the public
// site's VIDEO blocks and falls back to a raw <video src> for anything it
// doesn't recognise): here the link must be https, embed URLs are rebuilt
// from a validated video id (a crafted link can't embed an arbitrary site),
// and anything that isn't recognisably a video returns null so the learner
// page shows a plain "open link" instead.
export type ParsedVideo = { kind: "youtube" | "vimeo" | "file"; embedUrl: string };

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{5,12}$/;

export function parseVideoUrl(raw: string | null | undefined): ParsedVideo | null {
  const safe = safeHttpUrl(raw, { httpsOnly: true });
  if (!safe) return null;
  const url = new URL(safe);
  const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");

  if (host === "youtu.be") {
    const id = url.pathname.split("/")[1] || "";
    return YT_ID.test(id) ? { kind: "youtube", embedUrl: `https://www.youtube-nocookie.com/embed/${id}` } : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    let id = "";
    if (url.pathname === "/watch") id = url.searchParams.get("v") || "";
    else if (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live") id = parts[1] || "";
    return YT_ID.test(id) ? { kind: "youtube", embedUrl: `https://www.youtube-nocookie.com/embed/${id}` } : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = url.pathname.split("/").filter(Boolean).find((p) => VIMEO_ID.test(p)) || "";
    return VIMEO_ID.test(id) ? { kind: "vimeo", embedUrl: `https://player.vimeo.com/video/${id}` } : null;
  }
  if (/\.(mp4|webm|ogg)$/i.test(url.pathname)) return { kind: "file", embedUrl: safe };
  return null;
}
