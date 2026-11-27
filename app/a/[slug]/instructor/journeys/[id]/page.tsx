import { requireTenantSession } from "@/lib/authz";
import { INSTRUCTOR_NAV } from "@/lib/nav";
import JourneyEditorPage from "@/components/JourneyEditorPage";

export default async function Page({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const session = await requireTenantSession(slug, ["INSTRUCTOR"]);
  return <JourneyEditorPage slug={slug} area="instructor" session={session} navItems={INSTRUCTOR_NAV(slug)} journeyId={id} />;
}
