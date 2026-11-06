import { NextRequest, NextResponse } from "next/server";
import { Modules } from "@/lib/queries";
import { getSession } from "@/lib/auth";
import { readFile } from "@/lib/storage";
import { ModuleFiles } from "@/lib/activityQueries";
import { staffModule, learnerModule } from "@/lib/moduleAccess";
import { mediaKindOf } from "@/lib/activities";

export async function GET(req: NextRequest, ctx: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = await ctx.params;
  const mod = await Modules.byId(moduleId);
  const fileTypes = ["FILE", "VIDEO", "MEDIA", "FOLDER"];
  if (!mod || !fileTypes.includes(mod.content_type)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await getSession();
  if (!session || session.academyId !== mod.academy_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Learners need an enrolment (paid or free) in a course containing the
  // module. Instructors see only modules that are theirs; admins see all.
  if (session.role === "LEARNER") {
    if (!(await learnerModule(session, moduleId))) return NextResponse.json({ error: "Not enrolled" }, { status: 403 });
  } else if (session.role === "INSTRUCTOR") {
    if (!(await staffModule(session, moduleId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else if (session.role !== "ACADEMY_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // A FOLDER holds several files: ?file=<id> picks one (the id is looked up
  // inside this module, so another module's file id can't be fetched here).
  let target: { file_path: string | null; file_name: string | null; file_mime: string | null } = mod;
  if (mod.content_type === "FOLDER") {
    const fileId = req.nextUrl.searchParams.get("file") || "";
    const f = await ModuleFiles.byIdInModule(fileId, mod.id);
    if (!f) return NextResponse.json({ error: "Not found" }, { status: 404 });
    target = f;
  }
  if (!target.file_path) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const buffer = await readFile(target.file_path);
  if (!buffer) {
    return NextResponse.json({ error: "File missing" }, { status: 404 });
  }
  const mime = target.file_mime || "application/octet-stream";

  // VIDEO modules are played inline by a <video> element (?inline=1). Browsers
  // — Safari especially — seek and sometimes even start playback using HTTP
  // Range requests, so honour a single "bytes=start-end" range. FILE modules
  // keep the original attachment-download behaviour.
  // MEDIA uploads (image / audio / video) display inline the same way, but
  // only allow-listed media types are ever served inline, with nosniff and a
  // locked-down CSP so an uploaded file can't run script in this origin.
  const inlineOk =
    req.nextUrl.searchParams.get("inline") === "1" &&
    (mod.content_type === "VIDEO" || (mod.content_type === "MEDIA" && !!mediaKindOf(target.file_mime)));
  if (inlineOk) {
    const total = buffer.length;
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") || "");
    const base = {
      "Content-Type": mime,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    };
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
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `attachment; filename="${(target.file_name || "download").replace(/[^\w.\- ]/g, "_")}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
