import { requireTenantSession } from "@/lib/authz";
import { INSTRUCTOR_NAV } from "@/lib/nav";
import ModuleNewPage from "@/components/ModuleNewPage";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ type?: string; courseId?: string; error?: string }>;
}) {
  const { slug } = await params;
  const { type, courseId, error } = await searchParams;
  const session = await requireTenantSession(slug, ["INSTRUCTOR"]);
  return <ModuleNewPage slug={slug} area="instructor" session={session} navItems={INSTRUCTOR_NAV(slug)} type={type} courseId={courseId} error={error} />;
}
