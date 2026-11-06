import { notFound } from "next/navigation";
import { Academies, Templates, Courses, Enrollments, Modules } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { themeVars } from "@/lib/theme";
import PortalShell from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import { LEARNER_NAV } from "@/lib/nav";
import { getT, localeFor, normalizeLang } from "@/lib/i18n";
import { enrollFree } from "@/lib/actions/learning";
import Link from "next/link";
import CourseCard from "@/components/CourseCard";
import { COURSE_TYPES, TYPE_ANCHOR, parseEnabledTypes, normalizeCourseType } from "@/lib/courseTypes";

export default async function CatalogPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await requireTenantSession(slug, ["LEARNER"]);
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const lang = normalizeLang(academy.language);
  const t = getT(lang);
  const template = (await Templates.byId(academy.template_id))!;

  // Courses of the course types this academy has switched off are hidden (but learners already enrolled keep them in My Learning).
  const enabledTypes = parseEnabledTypes(academy.enabled_course_types);
  const myEnrollments0 = new Map((await Enrollments.listByLearner(session.userId)).map((e) => [e.course_id, e]));
  const courses = (await Courses.listByAcademy(academy.id, true)).filter((c) => enabledTypes.includes(normalizeCourseType(c.course_type)) || myEnrollments0.has(c.id));
  const stats = await Modules.statsByCourses(courses.map((c) => c.id));
  const locale = localeFor(lang);
  const myEnrollments = myEnrollments0;
  const boundEnroll = enrollFree.bind(null, slug);

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
      trialBanner={<TrialBanner academy={academy} slug={slug} showManage={false} />}
    >
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{t("catalog_title")}</h1>
      <p className="text-gray-500 text-sm mb-8">{t("catalog_summary", { n: courses.length, name: academy.name })}</p>

      {COURSE_TYPES.map((type) => {
        const items = courses.filter((c) => normalizeCourseType(c.course_type) === type);
        if (items.length === 0) return null;
        return (
          <section key={type} id={TYPE_ANCHOR[type]} className="mb-10 scroll-mt-4" data-testid="catalog-section" data-course-type={type}>
            <h2 className="text-lg font-bold text-gray-900 mb-4">{t(`type_${type.toLowerCase()}` as "type_self_paced")}</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((c) => {
                const enrollment = myEnrollments.get(c.id);
                return (
                  <CourseCard
                    key={c.id}
                    course={c}
                    template={template}
                    t={t}
                    locale={locale}
                    stats={stats[c.id]}
                    href={enrollment ? `/a/${slug}/learner/courses/${c.id}` : `/a/${slug}/courses/${c.id}`}
                    footer={
                      enrollment ? (
                        <Link href={`/a/${slug}/learner/courses/${c.id}`} className="app-btn-primary rounded-md px-4 py-2 text-xs font-semibold inline-block">
                          {enrollment.payment_status === "unpaid" ? t("course_complete_payment") : t("catalog_go")}
                        </Link>
                      ) : c.price_pence > 0 ? (
                        <Link href={`/a/${slug}/learner/checkout/${c.id}`} className="app-btn-accent rounded-md px-4 py-2 text-xs inline-block">
                          {t("catalog_buy")}
                        </Link>
                      ) : (
                        <form action={boundEnroll}>
                          <input type="hidden" name="courseId" value={c.id} />
                          <button type="submit" className="app-btn-primary rounded-md px-4 py-2 text-xs font-semibold">
                            {t("catalog_enrol_free")}
                          </button>
                        </form>
                      )
                    }
                  />
                );
              })}
            </div>
          </section>
        );
      })}
      {courses.length === 0 && <p className="text-sm text-gray-500">{t("catalog_none")}</p>}
    </PortalShell>
  );
}
