import { requireTenantSession } from "@/lib/authz";
import { INSTRUCTOR_NAV } from "@/lib/nav";
import CourseListPage from "@/components/CourseListPage";

export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ type?: string }> }) {
  const { slug } = await params;
  const { type } = await searchParams;
  const session = await requireTenantSession(slug, ["INSTRUCTOR"]);
  return <CourseListPage slug={slug} area="instructor" session={session} navItems={INSTRUCTOR_NAV(slug)} selectedType={type} />;
}
