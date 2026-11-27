import { requireTenantSession } from "@/lib/authz";
import { ADMIN_NAV } from "@/lib/nav";
import ModulesLibraryPage from "@/components/ModulesLibraryPage";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ courseId?: string; created?: string; saved?: string; error?: string; page?: string; q?: string }>;
}) {
  const { slug } = await params;
  const { courseId, created, saved, error, page, q } = await searchParams;
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  return <ModulesLibraryPage slug={slug} area="admin" session={session} navItems={ADMIN_NAV(slug)} courseId={courseId} notice={{ created, saved, error }} page={page} q={q} />;
}
