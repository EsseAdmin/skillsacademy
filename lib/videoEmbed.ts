// Turns a pasted video link (YouTube, Vimeo, or a direct video file URL)
// into something we can render. YouTube/Vimeo need their normal watch-page
// URL rewritten to their embeddable iframe URL; anything else is assumed to
// be a direct link to a video file and gets a plain <video> tag.
export function resolveVideoEmbed(rawUrl: string): { kind: "youtube" | "vimeo" | "file"; src: string } {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { kind: "file", src: rawUrl };
  }
  const host = url.hostname.replace(/^www\./, "");

  if (host === "youtu.be") {
    const id = url.pathname.slice(1);
    if (id) return { kind: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}` };
  }
  if (host === "youtube.com" || host === "m.youtube.com") {
    if (url.pathname === "/watch") {
      const id = url.searchParams.get("v");
      if (id) return { kind: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}` };
    }
    const shortsMatch = url.pathname.match(/^\/shorts\/([^/]+)/);
    if (shortsMatch) return { kind: "youtube", src: `https://www.youtube-nocookie.com/embed/${shortsMatch[1]}` };
    const embedMatch = url.pathname.match(/^\/embed\/([^/]+)/);
    if (embedMatch) return { kind: "youtube", src: `https://www.youtube-nocookie.com/embed/${embedMatch[1]}` };
  }
  if (host === "vimeo.com") {
    const idMatch = url.pathname.match(/^\/(\d+)/);
    if (idMatch) return { kind: "vimeo", src: `https://player.vimeo.com/video/${idMatch[1]}` };
  }
  if (host === "player.vimeo.com") {
    return { kind: "vimeo", src: rawUrl };
  }

  return { kind: "file", src: rawUrl };
}
