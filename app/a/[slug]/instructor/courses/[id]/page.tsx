import { requireTenantSession } from "@/lib/authz";
import { INSTRUCTOR_NAV } from "@/lib/nav";
import CourseDetailPage from "@/components/CourseDetailPage";

export default async function Page({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const session = await requireTenantSession(slug, ["INSTRUCTOR"]);
  return <CourseDetailPage slug={slug} area="instructor" courseId={id} session={session} navItems={INSTRUCTOR_NAV(slug)} />;
}
