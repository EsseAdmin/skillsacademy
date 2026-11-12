import { NextRequest, NextResponse } from "next/server";
import { readFile } from "@/lib/storage";
import { mimeTypeForPath } from "@/lib/mime";
import { Academies } from "@/lib/queries";
import { IMAGE_KEY_RE } from "@/lib/academyPage";
import { academyImageStorageKey } from "@/lib/academyPageContent";

// Public: pictures on an academy's designed page (and on the academy admin's unpublished
// draft of it). The file is looked up under the academy's own folder, and only names the
// designer generated itself match, so nothing else in storage can be fetched. Served with
// nosniff and a locked-down CSP so an SVG opened directly can't run script.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string; name: string }> }) {
  const { slug, name } = await ctx.params;
  if (!IMAGE_KEY_RE.test(name)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const academy = await Academies.bySlug(slug);
  if (!academy || academy.is_deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const buffer = await readFile(academyImageStorageKey(academy.id, name));
  if (!buffer) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": mimeTypeForPath(name),
      "Content-Length": String(buffer.length),
      // The name changes whenever the picture does, so it can be cached for a long time.
      "Cache-Control": "public, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
