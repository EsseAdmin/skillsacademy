import { requireTenantSession } from "@/lib/authz";
import { INSTRUCTOR_NAV } from "@/lib/nav";
import ScormUploadPage from "@/components/ScormUploadPage";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ courseId?: string; sectionId?: string }>;
}) {
  const { slug } = await params;
  const { courseId, sectionId } = await searchParams;
  const session = await requireTenantSession(slug, ["INSTRUCTOR"]);
  return <ScormUploadPage slug={slug} area="instructor" session={session} navItems={INSTRUCTOR_NAV(slug)} courseId={courseId} sectionId={sectionId} />;
}
