import Link from "next/link";
import { notFound } from "next/navigation";
import { Academies } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import AnalyticsFrame from "@/components/AnalyticsFrame";
import BarChart from "@/components/BarChart";
import { activitySeries, courseStats, overview, parseRange, pct, rangeFrom, RANGES, INACTIVE_DAYS } from "@/lib/analytics";
import { sendMeTheDigest, setAnalyticsDigest } from "@/lib/actions/analytics";

function Kpi({ label, value, hint, testId }: { label: string; value: string | number; hint?: string; testId?: string }) {
  return (
    <div className="app-card p-4" data-testid={testId}>
      <div className="text-xs font-semibold text-gray-500">{label}</div>
      <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
      {hint && <div className="text-xs text-gray-500 mt-1">{hint}</div>}
    </div>
  );
}

const dayLabel = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export default async function AnalyticsOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string; digest?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const range = parseRange(sp.range);
  const from = rangeFrom(range);
  const [o, series, courses] = await Promise.all([overview(academy.id, from), activitySeries(academy.id, range), courseStats(academy.id, from)]);
  const unitWord = series.unit === "day" ? "day" : "week";
  const boundToggle = setAnalyticsDigest.bind(null, slug);
  const boundTest = sendMeTheDigest.bind(null, slug);

  return (
    <AnalyticsFrame
      slug={slug}
      session={session}
      tab="overview"
      range={range}
      exportReport="courses"
      intro="How learners are engaging with your courses and modules. Pick a course to see exactly where people drop off."
    >
      {sp.digest === "sent" && <p className="mb-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">Sent - check your inbox.</p>}
      {sp.digest === "failed" && <p className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">The email couldn&apos;t be sent (email isn&apos;t fully set up on this platform yet).</p>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3" data-testid="kpis">
        <Kpi label="Learners" value={o.learners} hint={`${o.activeLearners} active ${RANGES[range].label.toLowerCase()}`} testId="kpi-learners" />
        <Kpi label="New enrolments" value={o.enrolmentsNew} hint={`${o.enrolmentsTotal} in total`} testId="kpi-enrolments" />
        <Kpi label="Modules completed" value={o.moduleCompletions} testId="kpi-completions" />
        <Kpi label="Average progress" value={`${o.avgProgress}%`} hint={`${o.courseCompletions} course${o.courseCompletions === 1 ? "" : "s"} finished in total`} testId="kpi-progress" />
        <Kpi label="Quiz attempts" value={o.quizAttempts} hint={o.quizPassRate === null ? "No quizzes taken" : `${o.quizPassRate}% passed`} testId="kpi-quiz" />
        <Kpi label="Certificates issued" value={o.certificates} testId="kpi-certs" />
        <Kpi label="Gone quiet" value={o.inactiveLearners} hint={`unfinished course, nothing for ${INACTIVE_DAYS}+ days`} testId="kpi-inactive" />
        <Link href={`/a/${slug}/admin/analytics/learners?state=inactive`} className="app-card p-4 flex items-center text-sm font-semibold app-link">
          See who has gone quiet →
        </Link>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-8">
        <BarChart title={`Modules completed per ${unitWord}`} points={series.points.map((p) => ({ label: dayLabel(p.bucket), value: p.completions }))} testId="chart-completions" />
        <BarChart title={`New enrolments per ${unitWord}`} points={series.points.map((p) => ({ label: dayLabel(p.bucket), value: p.enrolments }))} testId="chart-enrolments" />
      </div>

      <h2 className="font-semibold text-gray-900 mb-3">Courses</h2>
      <div className="app-card overflow-x-auto mb-8">
        <table className="w-full text-sm" data-testid="course-table">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
              <th className="px-4 py-3 font-semibold">Course</th>
              <th className="px-3 py-3 font-semibold text-right">Enrolled</th>
              <th className="px-3 py-3 font-semibold text-right">New</th>
              <th className="px-3 py-3 font-semibold text-right">Finished</th>
              <th className="px-3 py-3 font-semibold">Average progress</th>
              <th className="px-3 py-3 font-semibold text-right">Stalled</th>
              <th className="px-3 py-3 font-semibold text-right">Quiz avg</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => (
              <tr key={c.id} className="border-b border-gray-100 last:border-0" data-testid="course-row">
                <td className="px-4 py-3">
                  <Link href={`/a/${slug}/admin/analytics/courses/${c.id}${range === "30d" ? "" : `?range=${range}`}`} className="font-semibold text-gray-900 hover:underline">
                    {c.cover_emoji} {c.title}
                  </Link>
                  <div className="text-xs text-gray-500">
                    {c.modules} module{c.modules === 1 ? "" : "s"}
                    {c.is_published ? "" : " · not published"}
                  </div>
                </td>
                <td className="px-3 py-3 text-right">{c.enrolled}</td>
                <td className="px-3 py-3 text-right">{c.newEnrolments}</td>
                <td className="px-3 py-3 text-right">
                  {c.completed} <span className="text-xs text-gray-500">({pct(c.completed, c.enrolled)}%)</span>
                </td>
                <td className="px-3 py-3 min-w-[9rem]">
                  <div className="flex items-center gap-2">
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className="h-2 rounded-full" style={{ width: `${c.avgProgress}%`, background: "var(--brand-primary)" }} />
                    </div>
                    <span className="text-xs text-gray-600 w-8 text-right">{c.avgProgress}%</span>
                  </div>
                </td>
                <td className={`px-3 py-3 text-right ${c.stalled > 0 ? "text-amber-700 font-semibold" : ""}`}>{c.stalled}</td>
                <td className="px-3 py-3 text-right">{c.avgQuizScore === null ? "-" : `${c.avgQuizScore}%`}</td>
              </tr>
            ))}
            {courses.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No courses yet - reports appear once you have courses and learners.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500 mb-8">&ldquo;Stalled&rdquo; means enrolled, not finished, and nothing done for {INACTIVE_DAYS} days or more. Enrolled, Finished and Stalled count everyone ever enrolled; New and Quiz avg follow the time range above.</p>

      <div className="app-card p-5 flex flex-wrap items-center justify-between gap-4" data-testid="digest-card">
        <div>
          <div className="font-semibold text-gray-900 text-sm">Weekly email summary</div>
          <p className="text-xs text-gray-500 max-w-xl">Every Monday morning, each academy admin gets a short email: active learners, new enrolments, modules completed and which courses have stalled.</p>
        </div>
        <div className="flex items-center gap-2">
          <form action={boundToggle}>
            <input type="hidden" name="on" value={academy.analytics_digest ? "0" : "1"} />
            <button type="submit" className="rounded-md border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50" data-testid="digest-toggle">
              {academy.analytics_digest ? "Switch off" : "Switch on"}
            </button>
          </form>
          <form action={boundTest}>
            <button type="submit" className="app-btn-primary rounded-md px-3 py-2 text-xs font-semibold" data-testid="digest-test">
              Email me this week&apos;s summary now
            </button>
          </form>
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-2">Currently {academy.analytics_digest ? "on" : "off"}.</p>
    </AnalyticsFrame>
  );
}
