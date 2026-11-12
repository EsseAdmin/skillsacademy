import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Academies, Templates, Courses, Modules } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { Journeys } from "@/lib/journeys";
import { loadDraftForPreview } from "@/lib/academyPageContent";
import AcademyDesignedSite from "@/components/AcademyDesignedSite";

// The academy admin's saved draft of the public page, shown inside the designer's
// Preview tab. Only academy admins can open it, and it is never indexed.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Page preview", robots: { index: false, follow: false } };

export default async function DesignerPreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const template = (await Templates.byId(academy.template_id))!;
  const page = await loadDraftForPreview(academy);
  const courses = await Courses.listByAcademy(academy.id, true);
  const stats = await Modules.statsByCourses(courses.map((c) => c.id));
  const journeys = await Journeys.publishedViews(academy.id, slug);
  return <AcademyDesignedSite slug={slug} academy={academy} template={template} page={page} courses={courses} stats={stats} journeys={journeys} preview />;
}
