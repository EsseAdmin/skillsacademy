import { NextRequest, NextResponse } from "next/server";
import { Modules, Courses, Enrollments } from "@/lib/queries";
import { getSession } from "@/lib/auth";
import { readFile } from "@/lib/storage";

export async function GET(req: NextRequest, ctx: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = await ctx.params;
  const mod = await Modules.byId(moduleId);
  if (!mod || (mod.content_type !== "FILE" && mod.content_type !== "VIDEO") || !mod.file_path) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await getSession();
  if (!session || session.academyId !== mod.academy_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  if (session.role === "LEARNER") {
    // learner must be enrolled in a course that includes this module
    const academyCourses = await Courses.listByAcademy(mod.academy_id);
    let enrolled = false;
    for (const course of academyCourses) {
      const courseModules = await Modules.listByCourse(course.id);
      if (!courseModules.some((m) => m.id === moduleId)) continue;
      const enr = await Enrollments.byCourseAndLearner(course.id, session.userId);
      if (enr && (enr.payment_status === "paid" || enr.payment_status === "free")) {
        enrolled = true;
        break;
      }
    }
    if (!enrolled) {
      return NextResponse.json({ error: "Not enrolled" }, { status: 403 });
    }
  }

  const buffer = await readFile(mod.file_path);
  if (!buffer) {
    return NextResponse.json({ error: "File missing" }, { status: 404 });
  }
  const mime = mod.file_mime || "application/octet-stream";

  // VIDEO modules are played inline by a <video> element (?inline=1). Browsers
  // — Safari especially — seek and sometimes even start playback using HTTP
  // Range requests, so honour a single "bytes=start-end" range. FILE modules
  // keep the original attachment-download behaviour.
  if (mod.content_type === "VIDEO" && req.nextUrl.searchParams.get("inline") === "1") {
    const total = buffer.length;
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") || "");
    const base = { "Content-Type": mime, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" };
    if (range && (range[1] || range[2])) {
      let start = range[1] ? parseInt(range[1], 10) : total - parseInt(range[2], 10);
      let end = range[1] && range[2] ? parseInt(range[2], 10) : total - 1;
      start = Math.max(0, start);
      end = Math.min(end, total - 1);
      if (start > end || start >= total) {
        return new NextResponse(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${total}` } });
      }
      return new NextResponse(new Uint8Array(buffer.subarray(start, end + 1)), {
        status: 206,
        headers: { ...base, "Content-Range": `bytes ${start}-${end}/${total}`, "Content-Length": String(end - start + 1) },
      });
    }
    return new NextResponse(new Uint8Array(buffer), { headers: { ...base, "Content-Length": String(total) } });
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename="${mod.file_name || "download"}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
