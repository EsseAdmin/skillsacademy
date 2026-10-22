import { requireTenantSession } from "@/lib/authz";
import { INSTRUCTOR_NAV } from "@/lib/nav";
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
  const session = await requireTenantSession(slug, ["INSTRUCTOR"]);
  return <ContentAgentPage slug={slug} area="instructor" session={session} navItems={INSTRUCTOR_NAV(slug)} notice={done} error={error} />;
}
