import Link from "next/link";
import { notFound } from "next/navigation";
import { Academies, Courses } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import AnalyticsFrame from "@/components/AnalyticsFrame";
import { courseFunnel, courseLearners, inactiveCutoff, parseRange, pct } from "@/lib/analytics";
import { formatDate } from "@/lib/utils";

export default async function AnalyticsCoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; courseId: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { slug, courseId } = await params;
  const sp = await searchParams;
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const academy = await Academies.bySlug(slug);
  const course = await Courses.byId(courseId);
  if (!academy || !course || course.academy_id !== academy.id) notFound();
  const range = parseRange(sp.range);
  const [funnel, learners] = await Promise.all([courseFunnel(academy.id, courseId), courseLearners(academy.id, courseId)]);
  const enrolled = funnel[0]?.reached ?? learners.length;
  const cutoff = inactiveCutoff();
  // The module with the biggest fall from the one before it - the most useful "where do people give up" signal.
  let worst = -1;
  let worstDrop = 0;
  funnel.forEach((m, i) => {
    const prev = i === 0 ? enrolled : funnel[i - 1].completed;
    const drop = prev - m.completed;
    if (drop > worstDrop) {
      worstDrop = drop;
      worst = i;
    }
  });

  return (
    <AnalyticsFrame
      slug={slug}
      session={session}
      tab="overview"
      range={range}
      rangeApplies={false}
      exportReport={`course:${courseId}`}
      title={`${course.cover_emoji} ${course.title}`}
      intro={
        <>
          <Link href={`/a/${slug}/admin/analytics`} className="app-link font-semibold">
            ← All courses
          </Link>{" "}
          · {enrolled} enrolled, {learners.filter((l) => l.progress >= 100 || l.status === "completed").length} finished
        </>
      }
    >
      <h2 className="font-semibold text-gray-900 mb-1">Where learners drop off</h2>
      <p className="text-sm text-gray-500 mb-3">Each bar is the share of enrolled learners who completed that module, in course order.</p>
      <div className="app-card p-5 mb-8 grid gap-3" data-testid="funnel">
        {funnel.map((m, i) => {
          const rate = pct(m.completed, m.reached);
          return (
            <div key={m.id} data-testid="funnel-row" className="grid gap-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-semibold text-gray-900">
                  {i + 1}. {m.title} <span className="text-xs font-normal text-gray-500">{m.content_type.replace(/_/g, " ").toLowerCase()}</span>
                  {i === worst && worstDrop > 0 && (
                    <span className="ml-2 rounded-full bg-amber-50 text-amber-800 text-xs font-semibold px-2 py-0.5" data-testid="biggest-drop">
                      biggest drop-off
                    </span>
                  )}
                </span>
                <span className="text-gray-600 text-xs whitespace-nowrap">
                  {m.completed} of {m.reached} ({rate}%)
                  {m.avgScore !== null && ` · quiz avg ${m.avgScore}%, ${m.passRate}% pass (${m.attempts} attempts)`}
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5">
                <div className="h-2.5 rounded-full" style={{ width: `${rate}%`, background: "var(--brand-primary)" }} />
              </div>
            </div>
          );
        })}
        {funnel.length === 0 && <p className="text-sm text-gray-500">This course has no modules yet.</p>}
      </div>

      <h2 className="font-semibold text-gray-900 mb-3">Learners in this course</h2>
      <div className="app-card overflow-x-auto">
        <table className="w-full text-sm" data-testid="course-learners">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
              <th className="px-4 py-3 font-semibold">Learner</th>
              <th className="px-3 py-3 font-semibold">Progress</th>
              <th className="px-3 py-3 font-semibold text-right">Modules done</th>
              <th className="px-3 py-3 font-semibold">Enrolled</th>
              <th className="px-3 py-3 font-semibold">Last active</th>
            </tr>
          </thead>
          <tbody>
            {learners.map((l) => {
              const done = l.progress >= 100 || l.status === "completed";
              const quiet = !done && l.lastActive < cutoff;
              return (
                <tr key={l.id} className="border-b border-gray-100 last:border-0" data-testid="course-learner-row">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-900">{l.name}</div>
                    <div className="text-xs text-gray-500">{l.email}</div>
                  </td>
                  <td className="px-3 py-3 min-w-[9rem]">
                    <div className="flex items-center gap-2">
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div className="h-2 rounded-full" style={{ width: `${l.progress}%`, background: "var(--brand-primary)" }} />
                      </div>
                      <span className="text-xs text-gray-600 w-9 text-right">{l.progress}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">{l.modulesDone}</td>
                  <td className="px-3 py-3 text-gray-600">{formatDate(l.enrolledAt)}</td>
                  <td className={`px-3 py-3 ${quiet ? "text-amber-700 font-semibold" : "text-gray-600"}`}>
                    {formatDate(l.lastActive)}
                    {quiet && " · gone quiet"}
                  </td>
                </tr>
              );
            })}
            {learners.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  Nobody is enrolled yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AnalyticsFrame>
  );
}
