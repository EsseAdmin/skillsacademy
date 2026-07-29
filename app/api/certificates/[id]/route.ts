import { NextRequest, NextResponse } from "next/server";
import { Certificates } from "@/lib/queries";
import { readFile } from "@/lib/storage";

// Certificate PDFs are servable without auth — same as the public
// verification page at /certificates/[number], a real certificate is meant
// to be shareable/checkable by anyone who has the link, and it carries no
// sensitive data beyond the learner's name, course, and issue date (all
// already shown on the verification page itself).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const certificate = await Certificates.byId(id);
  if (!certificate) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const buffer = await readFile(certificate.pdf_path);
  if (!buffer) return NextResponse.json({ error: "File missing" }, { status: 404 });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="certificate-${certificate.certificate_number}.pdf"`,
      "Content-Length": String(buffer.length),
    },
  });
}
