import { NextRequest, NextResponse } from "next/server";
import { SiteBlocks } from "@/lib/queries";
import { readFile } from "@/lib/storage";
import { mimeTypeForPath } from "@/lib/mime";

// Public — these images are embedded directly in the academy's public
// homepage (no login required to view that page), same as course og-images.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const block = await SiteBlocks.byId(id);
  if (!block || !block.image_path) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const buffer = await readFile(block.image_path);
  if (!buffer) return NextResponse.json({ error: "File missing" }, { status: 404 });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": mimeTypeForPath(block.image_path),
      "Content-Length": String(buffer.length),
      "Cache-Control": "public, max-age=86400",
    },
  });
}
