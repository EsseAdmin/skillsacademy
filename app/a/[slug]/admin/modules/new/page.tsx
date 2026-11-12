import { requireTenantSession } from "@/lib/authz";
import { ADMIN_NAV } from "@/lib/nav";
import ModuleNewPage from "@/components/ModuleNewPage";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ type?: string; courseId?: string; sectionId?: string; error?: string }>;
}) {
  const { slug } = await params;
  const { type, courseId, sectionId, error } = await searchParams;
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  return <ModuleNewPage slug={slug} area="admin" session={session} navItems={ADMIN_NAV(slug)} type={type} courseId={courseId} sectionId={sectionId} error={error} />;
}
