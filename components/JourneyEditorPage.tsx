import Link from "next/link";
import { notFound } from "next/navigation";
import { Academies, Templates } from "@/lib/queries";
import { themeVars } from "@/lib/theme";
import PortalShell from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import JourneyEditor from "@/components/JourneyEditor";
import { Journeys } from "@/lib/journeys";
import { saveJourney } from "@/lib/actions/journeys";
import { agentCoursesFor, agentModulesFor } from "@/lib/aiAgent";
import type { SessionPayload } from "@/lib/auth";
import type { NavItem } from "@/components/PortalShell";

export default async function JourneyEditorPage({
  slug,
  area,
  session,
  navItems,
  journeyId,
}: {
  slug: string;
  area: "admin" | "instructor";
  session: SessionPayload;
  navItems: NavItem[];
  journeyId: string;
}) {
  const academy = (await Academies.bySlug(slug))!;
  const template = (await Templates.byId(academy.template_id))!;
  const journey = await Journeys.load(journeyId);
  // Same rule as the save action: an admin may open any journey of the academy, an instructor their own.
  if (!journey || journey.academyId !== academy.id || (area === "instructor" && journey.createdBy !== session.userId)) notFound();

  const courses = (await agentCoursesFor(session)).map((c) => ({ id: c.id, title: c.title }));
  const modules = (await agentModulesFor(session)).map((m) => ({ id: m.id, title: m.title }));
  const boundSave = saveJourney.bind(null, slug, journey.id);
  const { id: _id, academyId: _a, createdBy: _c, ...doc } = journey;
  void _id; void _a; void _c;

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
      <Link href={`/a/${slug}/${area}/journeys`} className="text-sm app-link mb-4 inline-block">
        ← All journeys
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Edit learning journey</h1>
      <JourneyEditor initial={doc} courses={courses} modules={modules} onSave={boundSave} homeHref={`/a/${slug}`} />
    </PortalShell>
  );
}
