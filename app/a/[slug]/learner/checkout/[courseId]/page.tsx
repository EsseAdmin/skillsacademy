import { notFound, redirect } from "next/navigation";
import { Academies, Templates, Courses, Enrollments } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { themeVars } from "@/lib/theme";
import { formatGBP } from "@/lib/utils";
import PortalShell from "@/components/PortalShell";
import { LEARNER_NAV } from "@/lib/nav";
import { getT, localeFor, normalizeLang } from "@/lib/i18n";
import { isTypeEnabled } from "@/lib/courseTypes";
import { courseNeedsPayment } from "@/lib/coursePayment";
import { safeHttpUrl } from "@/lib/safeUrl";

// Payment happens outside the platform: this page only points the learner to the academy's own payment link (if it set one).
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

  const paymentUrl = safeHttpUrl(course.payment_url, { httpsOnly: true });
  // A course that is (now) free - no price and no link - has nothing to pay for: let the learner straight in.
  if (!courseNeedsPayment(course)) {
    if (existing) {
      await Enrollments.markPaid(existing.id);
      redirect(`/a/${slug}/learner/courses/${courseId}`);
    }
    redirect(`/a/${slug}/learner/enrol/${courseId}`);
  }

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
            {course.price_pence > 0 && <div className="font-bold text-lg text-gray-900">{formatGBP(course.price_pence, localeFor(lang))}</div>}
          </div>
        </div>

        <div className="app-card p-6 grid gap-4" data-testid="checkout-box" data-has-link={paymentUrl ? "yes" : "no"}>
          {paymentUrl ? (
            <>
              <p className="text-sm text-gray-600">{t("payment_intro")}</p>
              <a href={paymentUrl} target="_blank" rel="noopener noreferrer" className="app-btn-accent rounded-md px-5 py-3 text-sm w-full text-center" data-testid="pay-on-academy-site">
                {t("payment_btn")}
              </a>
              <p className="text-xs text-gray-500">{t("payment_after")}</p>
            </>
          ) : (
            <p className="text-sm text-gray-600" data-testid="payment-contact">{t("payment_contact")}</p>
          )}
        </div>
      </div>
    </PortalShell>
  );
}
