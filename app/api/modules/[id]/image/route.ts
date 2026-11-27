import { NextRequest, NextResponse } from "next/server";
import { Modules } from "@/lib/queries";
import { readFile } from "@/lib/storage";
import { mimeTypeForPath } from "@/lib/mime";
import { getSession } from "@/lib/auth";

// A module's picture is public when the module belongs to a published course
// of a published academy (it appears on the public course page); otherwise only
// people signed in to the module's own academy can see it.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const mod = await Modules.byId(id);
  if (!mod || !mod.image_path) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const publiclyVisible = await Modules.isPubliclyVisible(id);
  if (!publiclyVisible) {
    const session = await getSession();
    if (!session || session.academyId !== mod.academy_id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const buffer = await readFile(mod.image_path);
  if (!buffer) return NextResponse.json({ error: "File missing" }, { status: 404 });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": mimeTypeForPath(mod.image_path),
      "Content-Length": String(buffer.length),
      "Cache-Control": publiclyVisible ? "public, max-age=3600" : "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
