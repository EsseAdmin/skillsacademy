import { NextRequest, NextResponse } from "next/server";
import { Academies, Courses } from "@/lib/queries";
import { readFile } from "@/lib/storage";
import { mimeTypeForPath } from "@/lib/mime";
import { getSession } from "@/lib/auth";

// Public for published courses of a published academy (it is shown on the
// public homepage and course page). Staff of the course's own academy can
// also see it while it is still a draft, so the edit page can preview it.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const course = await Courses.byId(id);
  if (!course || !course.cover_image_path) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const academy = await Academies.byId(course.academy_id);
  const publiclyVisible = !!academy && !academy.is_deleted && !!academy.is_published && !!course.is_published;
  if (!publiclyVisible) {
    const session = await getSession();
    const isStaff = !!session && session.academyId === course.academy_id && (session.role === "ACADEMY_ADMIN" || session.role === "INSTRUCTOR");
    if (!isStaff) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const buffer = await readFile(course.cover_image_path);
  if (!buffer) return NextResponse.json({ error: "File missing" }, { status: 404 });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": mimeTypeForPath(course.cover_image_path),
      "Content-Length": String(buffer.length),
      "Cache-Control": publiclyVisible ? "public, max-age=3600" : "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
