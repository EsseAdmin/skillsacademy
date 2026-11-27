import { NextRequest, NextResponse } from "next/server";
import { readFile } from "@/lib/storage";
import { mimeTypeForPath } from "@/lib/mime";
import { IMAGE_KEY_RE } from "@/lib/marketingPage";

// Public: pictures on the SkillsAcademy.ai home page (and on the super admin's
// unpublished draft of it). Only files the home page editor stored itself can be
// fetched — the name must match its generated pattern. Served with nosniff and a
// locked-down CSP so an SVG opened directly can't run script.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  if (!IMAGE_KEY_RE.test(name)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const buffer = await readFile(`marketing/${name}`);
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
