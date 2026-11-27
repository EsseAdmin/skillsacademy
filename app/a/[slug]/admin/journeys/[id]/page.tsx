import { requireTenantSession } from "@/lib/authz";
import { ADMIN_NAV } from "@/lib/nav";
import JourneyEditorPage from "@/components/JourneyEditorPage";

export default async function Page({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  return <JourneyEditorPage slug={slug} area="admin" session={session} navItems={ADMIN_NAV(slug)} journeyId={id} />;
}
