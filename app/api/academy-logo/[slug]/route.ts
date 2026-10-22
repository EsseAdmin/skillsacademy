import { NextRequest, NextResponse } from "next/server";
import { Academies } from "@/lib/queries";
import { readFile } from "@/lib/storage";
import { mimeTypeForPath } from "@/lib/mime";

// Public — the business logo is shown on the academy's public homepage, which
// needs no login. Served with nosniff and a locked-down CSP so that even an
// SVG opened directly can't run script.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const academy = await Academies.bySlug(slug);
  if (!academy || academy.is_deleted || !academy.logo_image_path) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const buffer = await readFile(academy.logo_image_path);
  if (!buffer) return NextResponse.json({ error: "File missing" }, { status: 404 });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": mimeTypeForPath(academy.logo_image_path),
      "Content-Length": String(buffer.length),
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
