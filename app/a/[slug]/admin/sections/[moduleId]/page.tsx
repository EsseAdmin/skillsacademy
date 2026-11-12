import { requireTenantSession } from "@/lib/authz";
import { ADMIN_NAV } from "@/lib/nav";
import ModuleSectionsPage from "@/components/ModuleSectionsPage";

export default async function Page({ params, searchParams }: { params: Promise<{ slug: string; moduleId: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { slug, moduleId } = await params;
  const { saved } = await searchParams;
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  return <ModuleSectionsPage slug={slug} area="admin" session={session} navItems={ADMIN_NAV(slug)} moduleId={moduleId} saved={saved} />;
}
