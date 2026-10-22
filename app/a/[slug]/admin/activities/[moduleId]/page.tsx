import { requireTenantSession } from "@/lib/authz";
import { ADMIN_NAV } from "@/lib/nav";
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
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  return <ActivityStaffPage slug={slug} area="admin" session={session} navItems={ADMIN_NAV(slug)} moduleId={moduleId} graded={graded} error={error} />;
}
