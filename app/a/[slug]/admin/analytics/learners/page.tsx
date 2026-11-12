import Link from "next/link";
import { notFound } from "next/navigation";
import { Academies } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import AnalyticsFrame from "@/components/AnalyticsFrame";
import { INACTIVE_DAYS, LEARNER_STATES, learnerStats, type LearnerState } from "@/lib/analytics";
import { formatDate } from "@/lib/utils";

const PAGE_SIZE = 50;

const STATE_STYLE: Record<LearnerState, string> = {
  active: "bg-emerald-50 text-emerald-700",
  inactive: "bg-amber-50 text-amber-800",
  not_started: "bg-gray-100 text-gray-600",
  finished: "bg-sky-50 text-sky-800",
};

export default async function AnalyticsLearnersPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ state?: string; q?: string; page?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const state = sp.state && sp.state in LEARNER_STATES ? (sp.state as LearnerState) : "";
  const q = (sp.q || "").trim().slice(0, 80);
  const page = Math.max(1, Math.floor(Number(sp.page) || 1));
  const { rows, total } = await learnerStats(academy.id, { q, state, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (over: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const all: Record<string, string | number | undefined> = { state: state || undefined, q: q || undefined, page: undefined, ...over };
    for (const [k, v] of Object.entries(all)) if (v !== undefined && v !== "") p.set(k, String(v));
    const s = p.toString();
    return `/a/${slug}/admin/analytics/learners${s ? `?${s}` : ""}`;
  };

  return (
    <AnalyticsFrame
      slug={slug}
      session={session}
      tab="learners"
      range="30d"
      rangeApplies={false}
      exportReport="learners"
      title="Learner engagement"
      intro={`Who is progressing and who needs a nudge. “Inactive” means an unfinished course with nothing done for ${INACTIVE_DAYS} days or more.`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter">
          <Link href={href({ state: undefined })} className={`rounded-full px-3 py-1 text-xs font-semibold ${state === "" ? "app-btn-primary" : "bg-gray-100 text-gray-600"}`}>
            Everyone
          </Link>
          {(Object.keys(LEARNER_STATES) as LearnerState[]).map((s) => (
            <Link key={s} href={href({ state: s })} className={`rounded-full px-3 py-1 text-xs font-semibold ${state === s ? "app-btn-primary" : "bg-gray-100 text-gray-600"}`} data-testid={`state-${s}`}>
              {LEARNER_STATES[s]}
            </Link>
          ))}
        </div>
        <form method="get" className="flex gap-2">
          {state && <input type="hidden" name="state" value={state} />}
          <input name="q" defaultValue={q} placeholder="Search name or email" className="rounded-md border border-gray-300 px-3 py-1.5 text-sm" data-testid="learner-q" />
          <button className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-semibold">Search</button>
        </form>
      </div>

      <div className="app-card overflow-x-auto">
        <table className="w-full text-sm" data-testid="learner-table">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
              <th className="px-4 py-3 font-semibold">Learner</th>
              <th className="px-3 py-3 font-semibold">Status</th>
              <th className="px-3 py-3 font-semibold text-right">Courses</th>
              <th className="px-3 py-3 font-semibold text-right">Finished</th>
              <th className="px-3 py-3 font-semibold">Average progress</th>
              <th className="px-3 py-3 font-semibold">Last active</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id} className="border-b border-gray-100 last:border-0" data-testid="learner-row" data-state={l.state}>
                <td className="px-4 py-3">
                  <div className="font-semibold text-gray-900">{l.name}</div>
                  <div className="text-xs text-gray-500">{l.email}</div>
                </td>
                <td className="px-3 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATE_STYLE[l.state]}`}>{LEARNER_STATES[l.state]}</span>
                </td>
                <td className="px-3 py-3 text-right">{l.courses}</td>
                <td className="px-3 py-3 text-right">{l.completed}</td>
                <td className="px-3 py-3 min-w-[9rem]">
                  <div className="flex items-center gap-2">
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className="h-2 rounded-full" style={{ width: `${l.avgProgress}%`, background: "var(--brand-primary)" }} />
                    </div>
                    <span className="text-xs text-gray-600 w-9 text-right">{l.avgProgress}%</span>
                  </div>
                </td>
                <td className="px-3 py-3 text-gray-600">{l.lastActive ? formatDate(l.lastActive) : "-"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No learners match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm" data-testid="learner-pager">
          <span className="text-gray-500">
            Page {page} of {pages} · {total} learners
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={href({ page: page - 1 })} className="rounded-md border border-gray-300 px-3 py-1.5 font-semibold">
                ← Previous
              </Link>
            )}
            {page < pages && (
              <Link href={href({ page: page + 1 })} className="rounded-md border border-gray-300 px-3 py-1.5 font-semibold">
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </AnalyticsFrame>
  );
}
