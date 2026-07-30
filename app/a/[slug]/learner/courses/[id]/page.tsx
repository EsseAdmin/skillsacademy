import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Academies, Templates, Courses, Modules, Enrollments, ModuleCompletions } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { themeVars } from "@/lib/theme";
import PortalShell from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import { LEARNER_NAV } from "@/lib/nav";
import { markModuleComplete } from "@/lib/actions/learning";

const CONTENT_ICON: Record<string, string> = { TEXT: "📝", URL: "🔗", FILE: "📎", LIVE_SESSION: "🎥", QUIZ: "🧪", SCORM: "📦" };

export default async function LearnerCoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const { slug, id } = await params;
  const { paid } = await searchParams;
  const session = await requireTenantSession(slug, ["LEARNER"]);
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const template = (await Templates.byId(academy.template_id))!;
  const course = await Courses.byId(id);
  if (!course || course.academy_id !== academy.id) notFound();

  const enrollment = await Enrollments.byCourseAndLearner(id, session.userId);
  if (!enrollment) {
    redirect(course.price_pence > 0 ? `/a/${slug}/learner/checkout/${id}` : `/a/${slug}/learner/catalog`);
  }
  if (enrollment.payment_status === "unpaid") {
    redirect(`/a/${slug}/learner/checkout/${id}`);
  }

  const modules = await Modules.listByCourse(id);
  const completedIds = new Set(await ModuleCompletions.listByEnrollment(enrollment.id));
  const boundComplete = markModuleComplete.bind(null, slug);

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
      <Link href={`/a/${slug}/learner`} className="text-sm app-link mb-4 inline-block">
        ← My learning
      </Link>
      {paid && (
        <div className="mb-6 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 px-5 py-4 text-sm">
          ✅ Payment successful — you now have full access to this course.
        </div>
      )}
      <h1 className="text-2xl font-bold text-gray-900 mb-1">
        {course.cover_emoji} {course.title}
      </h1>
      <p className="text-gray-500 text-sm mb-2">{course.description}</p>
      <div className="w-full bg-gray-100 rounded-full h-2 mb-8 max-w-sm">
        <div className="h-2 rounded-full app-btn-accent" style={{ width: `${enrollment.progress_pct}%` }} />
      </div>

      <div className="space-y-3">
        {modules.map((m, i) => {
          const done = completedIds.has(m.id);
          return (
            <div key={m.id} className="app-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="text-xs text-gray-400 mt-1 w-5">{i + 1}</span>
                  <div>
                    <div className="font-semibold text-gray-900 flex items-center gap-2">
                      <span>{CONTENT_ICON[m.content_type]}</span> {m.title}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">{m.description}</div>
                    <div className="mt-3 text-sm">
                      {m.content_type === "TEXT" && (
                        <p className="whitespace-pre-line text-gray-700 bg-gray-50 rounded-md p-4">{m.content_text}</p>
                      )}
                      {m.content_type === "URL" && (
                        <a href={m.content_url || "#"} target="_blank" rel="noreferrer" className="app-link break-all">
                          {m.content_url} ↗
                        </a>
                      )}
                      {m.content_type === "FILE" && (
                        <a href={`/api/files/${m.id}`} className="app-link">
                          📥 Download {m.file_name}
                        </a>
                      )}
                      {m.content_type === "LIVE_SESSION" && (
                        <div className="text-gray-700">
                          <span className="capitalize font-medium">{m.live_provider === "zoom" ? "Zoom" : "Microsoft Teams"}</span>
                          {m.live_start_time && ` · ${new Date(m.live_start_time).toLocaleString()}`}
                          {m.live_join_url && (
                            <div className="mt-2">
                              <a href={m.live_join_url} target="_blank" rel="noreferrer" className="app-btn-primary rounded-md px-4 py-2 text-xs font-semibold inline-block">
                                Join session ↗
                              </a>
                            </div>
                          )}
                        </div>
                      )}
                      {m.content_type === "QUIZ" && (
                        <a href={`/a/${slug}/learner/quiz/${m.id}?courseId=${course.id}`} className="app-link">
                          🧪 Take the quiz
                        </a>
                      )}
                      {m.content_type === "SCORM" && (
                        <a href={`/a/${slug}/learner/scorm/${m.id}?courseId=${course.id}`} className="app-link">
                          📦 Launch content
                        </a>
                      )}
                    </div>
                  </div>
                </div>
                {done ? (
                  <span className="text-xs font-semibold text-emerald-600 whitespace-nowrap">✓ Complete</span>
                ) : m.content_type === "TEXT" || m.content_type === "URL" || m.content_type === "FILE" || m.content_type === "LIVE_SESSION" ? (
                  <form action={boundComplete}>
                    <input type="hidden" name="courseId" value={course.id} />
                    <input type="hidden" name="moduleId" value={m.id} />
                    <button type="submit" className="text-xs font-semibold rounded-md px-3 py-1.5 border border-gray-300 hover:bg-gray-50 whitespace-nowrap">
                      Mark complete
                    </button>
                  </form>
                ) : (
                  <span className="text-xs text-gray-400 whitespace-nowrap">Not complete</span>
                )}
              </div>
            </div>
          );
        })}
        {modules.length === 0 && <p className="text-sm text-gray-500">No modules published yet — check back soon.</p>}
      </div>
    </PortalShell>
  );
}
