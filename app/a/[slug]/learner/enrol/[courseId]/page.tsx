import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Academies, Templates, Courses, Enrollments } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { themeVars } from "@/lib/theme";
import { formatGBP } from "@/lib/utils";
import PortalShell from "@/components/PortalShell";
import { LEARNER_NAV } from "@/lib/nav";
import { enrollFree } from "@/lib/actions/learning";

// Where "Enrol" on a public course page lands a new or returning learner once
// they have signed in: a one-click confirmation (enrolling is a POST, never a
// side effect of just opening a page).
export default async function EnrolConfirmPage({ params }: { params: Promise<{ slug: string; courseId: string }> }) {
  const { slug, courseId } = await params;
  const session = await requireTenantSession(slug, ["LEARNER"]);
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const template = (await Templates.byId(academy.template_id))!;
  const course = await Courses.byId(courseId);
  if (!course || course.academy_id !== academy.id || !course.is_published) notFound();

  const existing = await Enrollments.byCourseAndLearner(courseId, session.userId);
  if (existing) redirect(existing.payment_status === "unpaid" ? `/a/${slug}/learner/checkout/${courseId}` : `/a/${slug}/learner/courses/${courseId}`);

  const paid = course.price_pence > 0;
  const boundEnroll = enrollFree.bind(null, slug);

  return (
    <PortalShell
      brandName={academy.logo_text}
      brandTag="Learner"
      themeStyle={themeVars(template)}
      navItems={LEARNER_NAV(slug)}
      activeHref={`/a/${slug}/learner/catalog`}
      userName={session.name}
      userRoleLabel="Learner"
      logoutRedirect={`/a/${slug}/login`}
    >
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Enrol in this course</h1>
        <p className="text-gray-500 text-sm mb-8">One step to get started.</p>
        <div className="app-card p-6 grid gap-4">
          <div className="text-4xl">{course.cover_emoji}</div>
          <div>
            <div className="font-semibold text-gray-900 text-lg">{course.title}</div>
            <div className="text-xs text-gray-500">{course.category}</div>
          </div>
          <div className="font-bold text-gray-900 text-xl">{paid ? formatGBP(course.price_pence) : "Free"}</div>
          <form action={boundEnroll}>
            <input type="hidden" name="courseId" value={course.id} />
            <button type="submit" className="app-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold w-full" data-testid="confirm-enrol">
              {paid ? "Continue to checkout" : "Enrol now"}
            </button>
          </form>
          <Link href={`/a/${slug}/courses/${course.id}`} className="text-sm app-link text-center">
            ← Back to course details
          </Link>
        </div>
      </div>
    </PortalShell>
  );
}
