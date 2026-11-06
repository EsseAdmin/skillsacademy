import Link from "next/link";
import { notFound } from "next/navigation";
import { Academies, Templates, Courses, SiteBlocks, Modules } from "@/lib/queries";
import AcademyPublicSite from "@/components/AcademyPublicSite";
import { contrastTextColor } from "@/lib/color";
import { Journeys } from "@/lib/journeys";
import { getT } from "@/lib/i18n";

export default async function AcademyPublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const template = (await Templates.byId(academy.template_id))!;

  if (!academy.is_published) {
    const t = getT(academy.language);
    return (
      <div
        lang={academy.language}
        className="min-h-screen flex items-center justify-center px-6 text-center"
        style={{ background: template.primary_color, color: contrastTextColor(template.primary_color) }}
      >
        <div>
          <div className="text-2xl font-bold mb-3">{academy.logo_text}</div>
          <p className="opacity-80 mb-6">{t("site_not_published")}</p>
          <Link
            href={`/a/${slug}/login`}
            className="inline-block text-sm font-semibold px-6 py-3 rounded-md"
            style={{ background: template.accent_color, color: template.primary_color }}
          >
            {t("site_sign_in")}
          </Link>
        </div>
      </div>
    );
  }

  const courses = await Courses.listByAcademy(academy.id, true);
  const siteBlocks = await SiteBlocks.listByAcademy(academy.id, true);

  const stats = await Modules.statsByCourses(courses.map((c) => c.id));

  const journeys = await Journeys.publishedViews(academy.id, slug);

  return <AcademyPublicSite slug={slug} academy={academy} template={template} courses={courses} stats={stats} siteBlocks={siteBlocks} journeys={journeys} />;
}
