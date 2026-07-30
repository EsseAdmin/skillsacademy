import Link from "next/link";
import { notFound } from "next/navigation";
import { Academies, Templates, Courses, SiteBlocks } from "@/lib/queries";
import AcademyPublicSite from "@/components/AcademyPublicSite";

export default async function AcademyPublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const template = (await Templates.byId(academy.template_id))!;

  if (!academy.is_published) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-6 text-center"
        style={{ background: template.primary_color, color: "#fff" }}
      >
        <div>
          <div className="text-2xl font-bold mb-3">{academy.logo_text}</div>
          <p className="opacity-80 mb-6">This academy&apos;s public site isn&apos;t published yet.</p>
          <Link
            href={`/a/${slug}/login`}
            className="inline-block text-sm font-semibold px-6 py-3 rounded-md"
            style={{ background: template.accent_color, color: template.primary_color }}
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  const courses = await Courses.listByAcademy(academy.id, true);
  const siteBlocks = await SiteBlocks.listByAcademy(academy.id, true);

  return <AcademyPublicSite slug={slug} academy={academy} template={template} courses={courses} siteBlocks={siteBlocks} />;
}
