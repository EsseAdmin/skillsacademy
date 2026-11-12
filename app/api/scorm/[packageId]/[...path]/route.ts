import { NextRequest, NextResponse } from "next/server";
import { ScormPackages } from "@/lib/queries";
import { learnerEnrollmentsFor } from "@/lib/moduleAccess";
import { getSession } from "@/lib/auth";
import { readFile } from "@/lib/storage";
import { mimeTypeForPath } from "@/lib/mime";

// Serves individual files out of an extracted SCORM package (HTML, JS, CSS,
// images, audio/video, fonts — whatever the package contains). Access
// control mirrors /api/files/[moduleId]: same-academy staff always allowed;
// learners only if enrolled (paid/free) in a course that includes this
// module. Path segments are the SCORM package's own relative paths, which
// come from imsmanifest.xml and the zip's own entry names — never
// user-supplied at request time — so no extra traversal sanitization is
// needed beyond what storage.ts already does for its blob/local-disk keys.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ packageId: string; path: string[] }> }) {
  const { packageId, path } = await ctx.params;
  const pkg = await ScormPackages.byId(packageId);
  if (!pkg) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const session = await getSession();
  if (!session || session.academyId !== pkg.academy_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  if (session.role === "LEARNER") {
    // Enrolled (paid or free) in a course that lists this package's module, directly or inside a section.
    const enrolled = (await learnerEnrollmentsFor(pkg.academy_id, session.userId, pkg.module_id)).length > 0;
    if (!enrolled) return NextResponse.json({ error: "Not enrolled" }, { status: 403 });
  }

  const relativePath = path.join("/");
  const buffer = await readFile(`${pkg.storage_prefix}/${relativePath}`);
  if (!buffer) return NextResponse.json({ error: "File missing" }, { status: 404 });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": mimeTypeForPath(relativePath),
      "Content-Length": String(buffer.length),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
