import { requireTenantSession } from "@/lib/authz";
import { INSTRUCTOR_NAV } from "@/lib/nav";
import QuizBuilderPage from "@/components/QuizBuilderPage";

export default async function Page({ params }: { params: Promise<{ slug: string; moduleId: string }> }) {
  const { slug, moduleId } = await params;
  const session = await requireTenantSession(slug, ["INSTRUCTOR"]);
  return <QuizBuilderPage slug={slug} area="instructor" session={session} navItems={INSTRUCTOR_NAV(slug)} moduleId={moduleId} />;
}
