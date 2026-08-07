import { NextRequest, NextResponse } from "next/server";
import { Modules, Courses, Enrollments } from "@/lib/queries";
import { getSession } from "@/lib/auth";
import { readFile } from "@/lib/storage";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = await ctx.params;
  const mod = await Modules.byId(moduleId);
  if (!mod || mod.content_type !== "FILE" || !mod.file_path) {
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
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": mod.file_mime || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${mod.file_name || "download"}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
