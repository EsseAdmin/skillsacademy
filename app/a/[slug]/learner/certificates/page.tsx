import { notFound } from "next/navigation";
import { Academies, Templates, Certificates, Courses } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { themeVars } from "@/lib/theme";
import PortalShell from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import { LEARNER_NAV } from "@/lib/nav";
import { getT, localeFor, normalizeLang } from "@/lib/i18n";

export default async function LearnerCertificatesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await requireTenantSession(slug, ["LEARNER"]);
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const lang = normalizeLang(academy.language);
  const t = getT(lang);
  const template = (await Templates.byId(academy.template_id))!;

  const certificates = await Certificates.listByLearner(session.userId);
  const mine = certificates.filter((c) => c.academy_id === academy.id);
  const courseMap = await Courses.byIds(mine.map((c) => c.course_id));
  const withCourse = mine.map((c) => ({ ...c, course: courseMap.get(c.course_id) }));

  return (
    <PortalShell
      brandName={academy.logo_text}
      brandTag={t("role_learner")}
      themeStyle={themeVars(template)}
      navItems={LEARNER_NAV(slug, lang)}
      activeHref={`/a/${slug}/learner/certificates`}
      userName={session.name}
      userRoleLabel={t("role_learner")}
      logoutRedirect={`/a/${slug}/login`}
      lang={lang}
      trialBanner={<TrialBanner academy={academy} slug={slug} showManage={false} />}
    >
      <h1 className="text-2xl font-bold text-gray-900 mb-1">🎓 {t("cert_title")}</h1>
      <p className="text-gray-500 text-sm mb-8">{t("cert_intro")}</p>

      <div className="grid md:grid-cols-2 gap-4">
        {withCourse.map((c) => (
          <div key={c.id} className="app-card p-5">
            <div className="font-semibold text-gray-900">{c.course?.title || t("cert_course_fallback")}</div>
            <div className="text-xs text-gray-500 mt-1">
              {t("cert_issued", { date: new Date(c.issued_at).toLocaleDateString(localeFor(lang), { day: "numeric", month: "long", year: "numeric" }) })} · {t("cert_number", { number: c.certificate_number })}
            </div>
            <div className="flex gap-3 mt-3">
              <a href={`/api/certificates/${c.id}`} target="_blank" rel="noreferrer" className="text-sm app-link font-semibold">
                {t("cert_download")}
              </a>
              <a href={`/certificates/${c.certificate_number}`} target="_blank" rel="noreferrer" className="text-sm app-link font-semibold">
                {t("cert_verify")}
              </a>
            </div>
          </div>
        ))}
        {withCourse.length === 0 && <p className="text-sm text-gray-500">{t("cert_none")}</p>}
      </div>
    </PortalShell>
  );
}
