import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Academies, Templates, Courses, Modules, Enrollments, ScormPackages, ScormAttempts } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { themeVars } from "@/lib/theme";
import PortalShell from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import { LEARNER_NAV } from "@/lib/nav";
import ScormPlayer from "@/components/ScormPlayer";

export default async function LearnerScormPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; moduleId: string }>;
  searchParams: Promise<{ courseId?: string }>;
}) {
  const { slug, moduleId } = await params;
  const { courseId } = await searchParams;
  const session = await requireTenantSession(slug, ["LEARNER"]);
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const template = (await Templates.byId(academy.template_id))!;

  const mod = await Modules.byId(moduleId);
  if (!mod || mod.academy_id !== academy.id || mod.content_type !== "SCORM") notFound();
  const pkg = await ScormPackages.byModule(moduleId);
  if (!pkg) notFound();

  if (!courseId) notFound();
  const course = await Courses.byId(courseId);
  if (!course || course.academy_id !== academy.id) notFound();

  const enrollment = await Enrollments.byCourseAndLearner(courseId, session.userId);
  if (!enrollment || enrollment.payment_status === "unpaid") {
    redirect(`/a/${slug}/learner/courses/${courseId}`);
  }

  const attempt = await ScormAttempts.byPackageAndLearner(pkg.id, session.userId);
  const launchUrl = `/api/scorm/${pkg.id}/${pkg.launch_path}`;

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
      trialBanner={<TrialBanner academy={academy} slug={slug} showManage={false} />}
    >
      <Link href={`/a/${slug}/learner/courses/${courseId}`} className="text-sm app-link mb-4 inline-block">
        ← Back to course
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">📦 {mod.title}</h1>
      <p className="text-gray-500 text-sm mb-6">{mod.description}</p>
      {attempt && (attempt.lesson_status === "completed" || attempt.lesson_status === "passed" || attempt.completion_status === "completed") && (
        <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 px-5 py-4 text-sm">
          ✅ You&apos;ve completed this content{attempt.score_raw != null ? ` — score ${attempt.score_raw}` : ""}.
        </div>
      )}
      <ScormPlayer
        packageId={pkg.id}
        courseId={courseId}
        launchUrl={launchUrl}
        version={pkg.version}
        studentId={session.userId}
        studentName={session.name}
        initialSuspendData={attempt?.suspend_data || ""}
      />
    </PortalShell>
  );
}
