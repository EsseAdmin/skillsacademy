import { requireTenantSession } from "@/lib/authz";
import { INSTRUCTOR_NAV } from "@/lib/nav";
import ModulesLibraryPage from "@/components/ModulesLibraryPage";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ courseId?: string; created?: string; saved?: string; error?: string }>;
}) {
  const { slug } = await params;
  const { courseId, created, saved, error } = await searchParams;
  const session = await requireTenantSession(slug, ["INSTRUCTOR"]);
  return <ModulesLibraryPage slug={slug} area="instructor" session={session} navItems={INSTRUCTOR_NAV(slug)} courseId={courseId} notice={{ created, saved, error }} />;
}
