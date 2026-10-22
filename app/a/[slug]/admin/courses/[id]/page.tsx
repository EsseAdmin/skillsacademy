import { requireTenantSession } from "@/lib/authz";
import { ADMIN_NAV } from "@/lib/nav";
import CourseDetailPage from "@/components/CourseDetailPage";

export default async function Page({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  return <CourseDetailPage slug={slug} area="admin" courseId={id} session={session} navItems={ADMIN_NAV(slug)} />;
}
