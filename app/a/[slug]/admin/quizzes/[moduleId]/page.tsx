import { requireTenantSession } from "@/lib/authz";
import { ADMIN_NAV } from "@/lib/nav";
import QuizBuilderPage from "@/components/QuizBuilderPage";

export default async function Page({ params }: { params: Promise<{ slug: string; moduleId: string }> }) {
  const { slug, moduleId } = await params;
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  return <QuizBuilderPage slug={slug} area="admin" session={session} navItems={ADMIN_NAV(slug)} moduleId={moduleId} />;
}
