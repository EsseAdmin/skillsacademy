import { requireTenantSession } from "@/lib/authz";
import { ADMIN_NAV } from "@/lib/nav";
import QuizNewPage from "@/components/QuizNewPage";

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
  return <QuizNewPage slug={slug} area="admin" session={session} navItems={ADMIN_NAV(slug)} courseId={courseId} />;
}
