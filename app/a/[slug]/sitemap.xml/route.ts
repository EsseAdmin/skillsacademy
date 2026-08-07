import { NextRequest, NextResponse } from "next/server";
import { Academies, Courses } from "@/lib/queries";

// Auto-generated sitemap — the Starter-tier SEO feature (available to every
// academy regardless of plan). Lists the academy's public homepage plus
// every published course's public landing page.
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const academy = await Academies.bySlug(slug);
  if (!academy || !academy.is_published) {
    return new NextResponse("Not found", { status: 404 });
  }

  const base = process.env.APP_BASE_URL || new URL(req.url).origin;
  const courses = await Courses.listByAcademy(academy.id, true);

  const urls = [
    `${base}/a/${slug}`,
    ...courses.map((c) => `${base}/a/${slug}/courses/${c.id}`),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}
</urlset>`;

  return new NextResponse(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
