import { notFound, redirect } from "next/navigation";
import { Academies, Templates, Courses, Enrollments } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { themeVars } from "@/lib/theme";
import { formatGBP } from "@/lib/utils";
import PortalShell from "@/components/PortalShell";
import { LEARNER_NAV } from "@/lib/nav";
import { checkoutCourse } from "@/lib/actions/learning";
import CheckoutForm from "@/components/CheckoutForm";

export default async function CheckoutPage({ params }: { params: Promise<{ slug: string; courseId: string }> }) {
  const { slug, courseId } = await params;
  const session = await requireTenantSession(slug, ["LEARNER"]);
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const template = (await Templates.byId(academy.template_id))!;
  const course = await Courses.byId(courseId);
  if (!course || course.academy_id !== academy.id) notFound();

  const existing = await Enrollments.byCourseAndLearner(courseId, session.userId);
  if (existing?.payment_status === "paid") {
    redirect(`/a/${slug}/learner/courses/${courseId}`);
  }

  const boundCheckout = checkoutCourse.bind(null, slug, courseId);

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
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Checkout</h1>
        <p className="text-gray-500 text-sm mb-8">Complete your purchase to unlock this course.</p>

        <div className="app-card p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-gray-900">
                {course.cover_emoji} {course.title}
              </div>
              <div className="text-xs text-gray-500">{course.category}</div>
            </div>
            <div className="font-bold text-lg text-gray-900">{formatGBP(course.price_pence)}</div>
          </div>
        </div>

        <div className="app-card p-6">
          <CheckoutForm action={boundCheckout} amountLabel={formatGBP(course.price_pence)} />
        </div>
      </div>
    </PortalShell>
  );
}
