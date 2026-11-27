import { requireTenantSession } from "@/lib/authz";
import { INSTRUCTOR_NAV } from "@/lib/nav";
import ActivityStaffPage from "@/components/ActivityStaffPage";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; moduleId: string }>;
  searchParams: Promise<{ graded?: string; error?: string }>;
}) {
  const { slug, moduleId } = await params;
  const { graded, error } = await searchParams;
  const session = await requireTenantSession(slug, ["INSTRUCTOR"]);
  return <ActivityStaffPage slug={slug} area="instructor" session={session} navItems={INSTRUCTOR_NAV(slug)} moduleId={moduleId} graded={graded} error={error} />;
}
