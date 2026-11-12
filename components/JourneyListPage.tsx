import Link from "next/link";
import { Academies, Templates } from "@/lib/queries";
import { themeVars } from "@/lib/theme";
import PortalShell from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import { Journeys } from "@/lib/journeys";
import { createJourney, deleteJourney, setJourneyOnHomePage } from "@/lib/actions/journeys";
import { journeyIssues, siteJourneyIssues } from "@/lib/journeyVisibility";
import { loadPublishedDesign } from "@/lib/academyPageContent";
import type { SessionPayload } from "@/lib/auth";
import type { NavItem } from "@/components/PortalShell";

export default async function JourneyListPage({
  slug,
  area,
  session,
  navItems,
  error,
}: {
  slug: string;
  area: "admin" | "instructor";
  session: SessionPayload;
  navItems: NavItem[];
  error?: string;
}) {
  const academy = (await Academies.bySlug(slug))!;
  const template = (await Templates.byId(academy.template_id))!;
  // Admins see every journey in the academy; instructors their own.
  const journeys = await Journeys.list(academy.id, area === "admin" ? undefined : session.userId);
  const siteIssues = siteJourneyIssues({ slug, siteLive: !!academy.is_published, design: await loadPublishedDesign(academy), area });
  const boundCreate = createJourney.bind(null, slug);
  const boundDelete = deleteJourney.bind(null, slug);
  const boundHome = setJourneyOnHomePage.bind(null, slug);

  return (
    <PortalShell
      brandName={academy.logo_text}
      brandTag={area === "admin" ? "Academy Admin" : "Instructor"}
      themeStyle={themeVars(template)}
      navItems={navItems}
      activeHref={`/a/${slug}/${area}/journeys`}
      userName={session.name}
      userRoleLabel={area === "admin" ? "Academy Admin" : "Instructor"}
      logoutRedirect={`/a/${slug}/login`}
      trialBanner={<TrialBanner academy={academy} slug={slug} showManage={area === "admin"} />}
    >
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Learning Journeys</h1>
      <p className="text-gray-500 text-sm mb-8 max-w-2xl">
        Map out the routes learners can take through your courses and modules — one coloured pathway per career route or persona, with stations for each course, module or activity. Published journeys appear as a metro-style map on your academy&apos;s home page.
      </p>

      {error === "title" && <p className="mb-4 text-sm text-red-600">Give the journey a title first.</p>}
      {error === "limit" && <p className="mb-4 text-sm text-red-600">You&apos;ve reached the limit of 25 journeys — delete one before adding another.</p>}

      {siteIssues.length > 0 && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="journey-site-issues">
          <div className="font-semibold mb-1">Why your journeys may not appear on the home page</div>
          <ul className="grid gap-1">
            {siteIssues.map((i) => (
              <li key={i.code}>
                {i.text}{" "}
                {i.fixHref && (
                  <Link href={i.fixHref} className="font-semibold underline">
                    {i.fixLabel}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="app-card p-6 mb-8">
        <h2 className="font-semibold text-gray-900 mb-4">Create a journey</h2>
        <form action={boundCreate} className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5 flex-1 min-w-[16rem]">
            Title
            <input name="title" required maxLength={80} className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="e.g. Leadership development pathways" data-testid="new-journey-title" />
          </label>
          <button type="submit" className="app-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold" data-testid="create-journey">
            Create journey
          </button>
        </form>
      </div>

      <div className="grid gap-3">
        {journeys.map((j) => (
          <div key={j.id} className="app-card p-5 flex items-center justify-between gap-4" data-testid="journey-row">
            <div className="min-w-0">
              <Link href={`/a/${slug}/${area}/journeys/${j.id}`} className="font-semibold text-gray-900 hover:underline">
                {j.title}
              </Link>
              <div className="text-xs text-gray-500 mt-1">
                {j.line_count} pathway{j.line_count === 1 ? "" : "s"} · {j.station_count} station{j.station_count === 1 ? "" : "s"} ·{" "}
                {j.is_published && j.stop_count > 0 && siteIssues.length === 0 ? (
                  <span className="text-emerald-700 font-semibold">Shown on your home page</span>
                ) : j.is_published && j.stop_count > 0 ? (
                  <span className="text-amber-700 font-semibold">On, but not visible yet - see the note above</span>
                ) : j.is_published ? (
                  <span className="text-amber-700 font-semibold">On, but not visible yet</span>
                ) : (
                  "Not on your home page yet"
                )}
                {area === "admin" && j.creator_name ? ` · by ${j.creator_name}` : ""}
              </div>
              {journeyIssues(j).length > 0 && (
                <ul className="mt-1.5 text-xs text-amber-800 grid gap-0.5" data-testid="journey-issues">
                  {journeyIssues(j).map((i) => (
                    <li key={i.code}>• {i.text}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {j.is_published && j.stop_count > 0 && (
                <Link href={`/a/${slug}`} target="_blank" className="app-link text-sm font-semibold" data-testid="view-home">
                  View on home page ↗
                </Link>
              )}
              <form action={boundHome}>
                <input type="hidden" name="journeyId" value={j.id} />
                <input type="hidden" name="show" value={j.is_published ? "0" : "1"} />
                <button
                  type="submit"
                  disabled={j.station_count === 0 || j.line_count === 0}
                  title={j.station_count === 0 ? "Add pathways and stations first" : undefined}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${j.is_published ? "border border-gray-300 text-gray-700" : "app-btn-primary"}`}
                  data-testid="toggle-home"
                >
                  {j.is_published ? "Remove from home page" : "Add to home page"}
                </button>
              </form>
              <Link href={`/a/${slug}/${area}/journeys/${j.id}`} className="app-link text-sm font-semibold">
                Edit
              </Link>
              <form action={boundDelete}>
                <input type="hidden" name="journeyId" value={j.id} />
                <button type="submit" className="text-xs font-semibold text-red-600 hover:underline">
                  Delete
                </button>
              </form>
            </div>
          </div>
        ))}
        {journeys.length === 0 && <p className="text-sm text-gray-500">No journeys yet — create your first one above.</p>}
      </div>
    </PortalShell>
  );
}
