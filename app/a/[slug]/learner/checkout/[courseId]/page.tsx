import { notFound, redirect } from "next/navigation";
import { Academies, Templates, Courses, Enrollments } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { themeVars } from "@/lib/theme";
import { formatGBP } from "@/lib/utils";
import PortalShell from "@/components/PortalShell";
import { LEARNER_NAV } from "@/lib/nav";
import { getT, localeFor, normalizeLang } from "@/lib/i18n";
import { checkoutCourse } from "@/lib/actions/learning";
import CheckoutForm from "@/components/CheckoutForm";
import { isTypeEnabled } from "@/lib/courseTypes";

export default async function CheckoutPage({ params }: { params: Promise<{ slug: string; courseId: string }> }) {
  const { slug, courseId } = await params;
  const session = await requireTenantSession(slug, ["LEARNER"]);
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const lang = normalizeLang(academy.language);
  const t = getT(lang);
  const template = (await Templates.byId(academy.template_id))!;
  const course = await Courses.byId(courseId);
  if (!course || course.academy_id !== academy.id) notFound();

  const existing = await Enrollments.byCourseAndLearner(courseId, session.userId);
  if (existing?.payment_status === "paid") {
    redirect(`/a/${slug}/learner/courses/${courseId}`);
  }

  if (!existing && !isTypeEnabled(academy.enabled_course_types, course.course_type)) notFound();

  const boundCheckout = checkoutCourse.bind(null, slug, courseId);

  return (
    <PortalShell
      brandName={academy.logo_text}
      brandTag={t("role_learner")}
      themeStyle={themeVars(template)}
      navItems={LEARNER_NAV(slug, lang)}
      activeHref={`/a/${slug}/learner/catalog`}
      userName={session.name}
      userRoleLabel={t("role_learner")}
      logoutRedirect={`/a/${slug}/login`}
      lang={lang}
    >
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{t("checkout_title")}</h1>
        <p className="text-gray-500 text-sm mb-8">{t("checkout_sub")}</p>

        <div className="app-card p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-gray-900">
                {course.cover_emoji} {course.title}
              </div>
              <div className="text-xs text-gray-500">{course.category}</div>
            </div>
            <div className="font-bold text-lg text-gray-900">{formatGBP(course.price_pence, localeFor(lang))}</div>
          </div>
        </div>

        <div className="app-card p-6">
          <CheckoutForm action={boundCheckout} amountLabel={formatGBP(course.price_pence, localeFor(lang))} lang={lang} />
        </div>
      </div>
    </PortalShell>
  );
}
