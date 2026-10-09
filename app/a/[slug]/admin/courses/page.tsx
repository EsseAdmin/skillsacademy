import { requireTenantSession } from "@/lib/authz";
import { ADMIN_NAV } from "@/lib/nav";
import CourseListPage from "@/components/CourseListPage";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  return <CourseListPage slug={slug} area="admin" session={session} navItems={ADMIN_NAV(slug)} />;
}
