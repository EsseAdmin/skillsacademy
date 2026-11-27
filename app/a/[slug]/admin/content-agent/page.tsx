import { requireTenantSession } from "@/lib/authz";
import { ADMIN_NAV } from "@/lib/nav";
import ContentAgentPage from "@/components/ContentAgentPage";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  const { slug } = await params;
  const { done, error } = await searchParams;
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  return <ContentAgentPage slug={slug} area="admin" session={session} navItems={ADMIN_NAV(slug)} notice={done} error={error} />;
}
