import { requireTenantSession } from "@/lib/authz";
import { ADMIN_NAV } from "@/lib/nav";
import MarketingPage from "@/components/MarketingPage";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ courseId?: string }>;
}) {
  const { slug } = await params;
  const { courseId } = await searchParams;
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  return <MarketingPage slug={slug} area="admin" session={session} navItems={ADMIN_NAV(slug)} courseId={courseId} />;
}
