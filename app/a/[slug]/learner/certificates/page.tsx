import { notFound } from "next/navigation";
import { Academies, Templates, Certificates, Courses } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { themeVars } from "@/lib/theme";
import PortalShell from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import { LEARNER_NAV } from "@/lib/nav";

export default async function LearnerCertificatesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await requireTenantSession(slug, ["LEARNER"]);
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const template = (await Templates.byId(academy.template_id))!;

  const certificates = await Certificates.listByLearner(session.userId);
  const withCourse = await Promise.all(
    certificates.filter((c) => c.academy_id === academy.id).map(async (c) => ({ ...c, course: await Courses.byId(c.course_id) }))
  );

  return (
    <PortalShell
      brandName={academy.logo_text}
      brandTag="Learner"
      themeStyle={themeVars(template)}
      navItems={LEARNER_NAV(slug)}
      activeHref={`/a/${slug}/learner/certificates`}
      userName={session.name}
      userRoleLabel="Learner"
      logoutRedirect={`/a/${slug}/login`}
      trialBanner={<TrialBanner academy={academy} slug={slug} showManage={false} />}
    >
      <h1 className="text-2xl font-bold text-gray-900 mb-1">🎓 My Certificates</h1>
      <p className="text-gray-500 text-sm mb-8">Certificates are issued automatically once you complete a certification-enabled course.</p>

      <div className="grid md:grid-cols-2 gap-4">
        {withCourse.map((c) => (
          <div key={c.id} className="app-card p-5">
            <div className="font-semibold text-gray-900">{c.course?.title || "Course"}</div>
            <div className="text-xs text-gray-500 mt-1">
              Issued {new Date(c.issued_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} · No.{" "}
              {c.certificate_number}
            </div>
            <div className="flex gap-3 mt-3">
              <a href={`/api/certificates/${c.id}`} target="_blank" rel="noreferrer" className="text-sm app-link font-semibold">
                Download PDF ↗
              </a>
              <a href={`/certificates/${c.certificate_number}`} target="_blank" rel="noreferrer" className="text-sm app-link font-semibold">
                Verification page ↗
              </a>
            </div>
          </div>
        ))}
        {withCourse.length === 0 && <p className="text-sm text-gray-500">No certificates yet — complete a certification-enabled course to earn one.</p>}
      </div>
    </PortalShell>
  );
}
