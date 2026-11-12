import Link from "next/link";
import type { ReactNode } from "react";
import { Academies, Templates } from "@/lib/queries";
import { themeVars } from "@/lib/theme";
import PortalShell from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import { ADMIN_NAV } from "@/lib/nav";
import { RANGES, type RangeKey } from "@/lib/analytics";
import type { SessionPayload } from "@/lib/auth";

export type AnalyticsTab = "overview" | "modules" | "learners";

const TABS: { id: AnalyticsTab; label: string; path: string }[] = [
  { id: "overview", label: "Overview & courses", path: "" },
  { id: "modules", label: "Modules", path: "/modules" },
  { id: "learners", label: "Learners", path: "/learners" },
];

/** The portal shell, the title and the tab bar shared by every analytics page. */
export default async function AnalyticsFrame({
  slug,
  session,
  tab,
  range,
  rangeApplies = true,
  hideTabs = false,
  exportReport,
  title = "Engagement analytics",
  intro,
  children,
}: {
  slug: string;
  session: SessionPayload;
  tab: AnalyticsTab;
  range: RangeKey;
  rangeApplies?: boolean;
  hideTabs?: boolean;
  exportReport?: string; // e.g. "courses": adds a "Download CSV" link
  title?: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  const academy = (await Academies.bySlug(slug))!;
  const template = (await Templates.byId(academy.template_id))!;
  const base = `/a/${slug}/admin/analytics`;
  const q = (r: RangeKey) => (r === "30d" ? "" : `?range=${r}`);
  return (
    <PortalShell
      brandName={academy.logo_text}
      brandTag="Academy Admin"
      themeStyle={themeVars(template)}
      navItems={ADMIN_NAV(slug)}
      activeHref={hideTabs ? `/a/${slug}/admin/payments` : base}
      userName={session.name}
      userRoleLabel="Academy Admin"
      logoutRedirect={`/a/${slug}/login`}
      trialBanner={<TrialBanner academy={academy} slug={slug} showManage />}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{title}</h1>
          {intro && <p className="text-gray-500 text-sm max-w-2xl">{intro}</p>}
        </div>
        {exportReport && (
          <a
            href={`${base}/export?report=${exportReport}&range=${range}`}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            data-testid="export-csv"
          >
            ⬇ Download CSV
          </a>
        )}
      </div>

      {!hideTabs && (
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 border-b border-gray-200">
        <nav className="flex gap-1" aria-label="Analytics sections">
          {TABS.map((t) => (
            <Link
              key={t.id}
              href={`${base}${t.path}${q(range)}`}
              className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 ${tab === t.id ? "border-[var(--brand-primary)] text-gray-900" : "border-transparent text-gray-500 hover:text-gray-800"}`}
              data-testid={`tab-${t.id}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        {rangeApplies && (
          <div className="flex gap-1 pb-2" role="group" aria-label="Time range">
            {(Object.keys(RANGES) as RangeKey[]).map((r) => (
              <Link
                key={r}
                href={`${base}${TABS.find((t) => t.id === tab)!.path}${q(r)}`}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${range === r ? "app-btn-primary" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                data-testid={`range-${r}`}
              >
                {RANGES[r].label}
              </Link>
            ))}
          </div>
        )}
      </div>
      )}
      {children}
    </PortalShell>
  );
}
