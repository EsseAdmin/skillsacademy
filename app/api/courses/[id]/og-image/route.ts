import { NextRequest, NextResponse } from "next/server";
import { Courses } from "@/lib/queries";
import { readFile } from "@/lib/storage";
import { mimeTypeForPath } from "@/lib/mime";

// Public — OG/share images are meant to be fetched by social platforms'
// crawlers (Facebook, LinkedIn, X, etc.) with no auth context, same as any
// og:image URL.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const course = await Courses.byId(id);
  if (!course || !course.seo_og_image_path) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const buffer = await readFile(course.seo_og_image_path);
  if (!buffer) return NextResponse.json({ error: "File missing" }, { status: 404 });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": mimeTypeForPath(course.seo_og_image_path),
      "Content-Length": String(buffer.length),
      "Cache-Control": "public, max-age=86400",
    },
  });
}
