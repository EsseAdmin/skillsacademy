import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { Modules } from "@/lib/queries";
import { Submissions } from "@/lib/activityQueries";
import { staffModule } from "@/lib/moduleAccess";
import { readFile } from "@/lib/storage";

// Download the file attached to an assignment hand-in. Allowed for the learner
// who submitted it, for the instructor/admin who manages that assignment, and
// nobody else — including users of other academies.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session || !session.academyId) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const sub = await Submissions.byId(id);
  if (!sub || !sub.file_path) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const mod = await Modules.byId(sub.module_id);
  if (!mod || mod.academy_id !== session.academyId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = session.role === "LEARNER" && sub.learner_id === session.userId;
  const isStaff = (session.role === "ACADEMY_ADMIN" || session.role === "INSTRUCTOR") && !!(await staffModule(session, mod.id));
  if (!isOwner && !isStaff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const buf = await readFile(sub.file_path);
  if (!buf) return NextResponse.json({ error: "File missing" }, { status: 404 });
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": sub.file_mime || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `attachment; filename="${(sub.file_name || "submission").replace(/[^\w.\- ]/g, "_")}"`,
      "Content-Length": String(buf.length),
    },
  });
}
