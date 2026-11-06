import { requireTenantSession } from "@/lib/authz";
import { INSTRUCTOR_NAV } from "@/lib/nav";
import ScormUploadPage from "@/components/ScormUploadPage";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ courseId?: string }>;
}) {
  const { slug } = await params;
  const { courseId } = await searchParams;
  const session = await requireTenantSession(slug, ["INSTRUCTOR"]);
  return <ScormUploadPage slug={slug} area="instructor" session={session} navItems={INSTRUCTOR_NAV(slug)} courseId={courseId} />;
}
