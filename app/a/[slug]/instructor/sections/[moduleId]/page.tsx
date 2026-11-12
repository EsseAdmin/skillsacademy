import { requireTenantSession } from "@/lib/authz";
import { INSTRUCTOR_NAV } from "@/lib/nav";
import ModuleSectionsPage from "@/components/ModuleSectionsPage";

export default async function Page({ params, searchParams }: { params: Promise<{ slug: string; moduleId: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { slug, moduleId } = await params;
  const { saved } = await searchParams;
  const session = await requireTenantSession(slug, ["INSTRUCTOR"]);
  return <ModuleSectionsPage slug={slug} area="instructor" session={session} navItems={INSTRUCTOR_NAV(slug)} moduleId={moduleId} saved={saved} />;
}
