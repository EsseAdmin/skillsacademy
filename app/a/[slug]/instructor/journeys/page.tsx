import { requireTenantSession } from "@/lib/authz";
import { INSTRUCTOR_NAV } from "@/lib/nav";
import JourneyListPage from "@/components/JourneyListPage";

export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string }> }) {
  const { slug } = await params;
  const { error } = await searchParams;
  const session = await requireTenantSession(slug, ["INSTRUCTOR"]);
  return <JourneyListPage slug={slug} area="instructor" session={session} navItems={INSTRUCTOR_NAV(slug)} error={error} />;
}
