import Link from "next/link";
import { notFound } from "next/navigation";
import { Academies } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import AnalyticsFrame from "@/components/AnalyticsFrame";
import { moduleStats, parseRange, pct, rangeFrom, type ModuleSort } from "@/lib/analytics";

const PAGE_SIZE = 25;

export default async function AnalyticsModulesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string; sort?: string; q?: string; page?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const range = parseRange(sp.range);
  const sort: ModuleSort = sp.sort === "popular" ? "popular" : "attention";
  const q = (sp.q || "").trim().slice(0, 80);
  const page = Math.max(1, Math.floor(Number(sp.page) || 1));
  const { rows, total } = await moduleStats(academy.id, rangeFrom(range), { sort, q, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (over: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const all: Record<string, string | number | undefined> = { range: range === "30d" ? undefined : range, sort: sort === "attention" ? undefined : sort, q: q || undefined, page: undefined, ...over };
    for (const [k, v] of Object.entries(all)) if (v !== undefined && v !== "") p.set(k, String(v));
    const s = p.toString();
    return `/a/${slug}/admin/analytics/modules${s ? `?${s}` : ""}`;
  };

  return (
    <AnalyticsFrame
      slug={slug}
      session={session}
      tab="modules"
      range={range}
      exportReport="modules"
      title="Module engagement"
      intro="How many of the learners who could reach each module have completed it. Start with the modules that need attention - a low completion rate often means the content is too long, unclear or too hard."
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex gap-1" role="group" aria-label="Sort">
          <Link href={href({ sort: undefined })} className={`rounded-full px-3 py-1 text-xs font-semibold ${sort === "attention" ? "app-btn-primary" : "bg-gray-100 text-gray-600"}`}>
            Needs attention
          </Link>
          <Link href={href({ sort: "popular" })} className={`rounded-full px-3 py-1 text-xs font-semibold ${sort === "popular" ? "app-btn-primary" : "bg-gray-100 text-gray-600"}`}>
            Most completed
          </Link>
        </div>
        <form method="get" className="flex gap-2">
          {range !== "30d" && <input type="hidden" name="range" value={range} />}
          {sort !== "attention" && <input type="hidden" name="sort" value={sort} />}
          <input name="q" defaultValue={q} placeholder="Search modules" className="rounded-md border border-gray-300 px-3 py-1.5 text-sm" data-testid="module-q" />
          <button className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-semibold">Search</button>
        </form>
      </div>

      <div className="app-card overflow-x-auto">
        <table className="w-full text-sm" data-testid="module-table">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
              <th className="px-4 py-3 font-semibold">Module</th>
              <th className="px-3 py-3 font-semibold">Type</th>
              <th className="px-3 py-3 font-semibold text-right">In courses</th>
              <th className="px-3 py-3 font-semibold text-right">Learners who can reach it</th>
              <th className="px-3 py-3 font-semibold text-right">Completed</th>
              <th className="px-3 py-3 font-semibold">Completion rate</th>
              <th className="px-3 py-3 font-semibold text-right">Completed in period</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const rate = pct(m.completed, m.reached);
              return (
                <tr key={m.id} className="border-b border-gray-100 last:border-0" data-testid="module-row">
                  <td className="px-4 py-3 font-semibold text-gray-900">{m.title}</td>
                  <td className="px-3 py-3 text-gray-600">{m.content_type.replace(/_/g, " ").toLowerCase()}</td>
                  <td className="px-3 py-3 text-right">{m.courses}</td>
                  <td className="px-3 py-3 text-right">{m.reached}</td>
                  <td className="px-3 py-3 text-right">{m.completed}</td>
                  <td className="px-3 py-3 min-w-[9rem]">
                    {m.reached === 0 ? (
                      <span className="text-xs text-gray-400">not reached yet</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div className="h-2 rounded-full" style={{ width: `${rate}%`, background: "var(--brand-primary)" }} />
                        </div>
                        <span className="text-xs text-gray-600 w-9 text-right">{rate}%</span>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">{m.completedInPeriod}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  {q ? "No modules match that search." : "No modules yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm" data-testid="module-pager">
          <span className="text-gray-500">
            Page {page} of {pages} · {total} modules
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
