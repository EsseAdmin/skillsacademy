import Link from "next/link";
import { Academies, Templates, Courses } from "@/lib/queries";
import { themeVars } from "@/lib/theme";
import PortalShell, { type NavItem } from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import ModuleForm from "@/components/ModuleForm";
import ActivityFields from "@/components/ActivityFields";
import { createModule } from "@/lib/actions/modules";
import { createActivity } from "@/lib/actions/activities";
import { CATALOG, isConfigType } from "@/lib/activities";
import type { SessionPayload } from "@/lib/auth";

const LEGACY = ["TEXT", "URL", "FILE", "VIDEO", "LIVE_SESSION"] as const;

// The create screen the activity picker sends you to: one form for the chosen type.
export default async function ModuleNewPage({
  slug, area, session, navItems, type, courseId, error,
}: {
  slug: string;
  area: "admin" | "instructor";
  session: SessionPayload;
  navItems: NavItem[];
  type?: string;
  courseId?: string;
  error?: string;
}) {
  const academy = (await Academies.bySlug(slug))!;
  const template = (await Templates.byId(academy.template_id))!;
  const item = CATALOG.find((c) => c.type === type);
  const course = courseId ? await Courses.byId(courseId) : undefined;
  const validCourse = course && course.academy_id === academy.id ? course : undefined;
  const library = `/a/${slug}/${area}/modules${validCourse ? `?courseId=${validCourse.id}` : ""}`;

  return (
    <PortalShell
      brandName={academy.logo_text}
      brandTag={area === "admin" ? "Academy Admin" : "Instructor"}
      themeStyle={themeVars(template)}
      navItems={navItems}
      activeHref={`/a/${slug}/${area}/modules`}
      userName={session.name}
      userRoleLabel={area === "admin" ? "Academy Admin" : "Instructor"}
      logoutRedirect={`/a/${slug}/login`}
      trialBanner={<TrialBanner academy={academy} slug={slug} showManage={area === "admin"} />}
    >
      <Link href={library} className="text-sm app-link mb-4 inline-block">← Module library</Link>
      {!item || item.href !== "form" ? (
        <p className="text-sm text-gray-700">That activity type isn&apos;t available here. <Link href={library} className="app-link">Choose another</Link>.</p>
      ) : (
        <>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{item.icon} Add {item.label === "URL" ? "a URL" : `a ${item.label.toLowerCase()}`}</h1>
          <p className="text-gray-700 text-sm mb-6">{item.blurb}{validCourse ? ` It will be added to “${validCourse.title}”.` : ""}</p>
          {error && <div role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-800">{error}</div>}
          <div className="app-card p-6 max-w-3xl">
            {isConfigType(item.type) ? (
              <form action={createActivity.bind(null, slug)} className="grid gap-4">
                <input type="hidden" name="content_type" value={item.type} />
                {validCourse && <input type="hidden" name="courseId" value={validCourse.id} />}
                <label className="text-xs font-semibold text-gray-700 grid gap-1.5">
                  Title
                  <input name="title" required maxLength={200} className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900" />
                </label>
                <label className="text-xs font-semibold text-gray-700 grid gap-1.5">
                  Short description (optional)
                  <input name="description" maxLength={400} className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900" />
                </label>
                <ActivityFields type={item.type} />
                <div><button type="submit" className="app-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold">Save and return to library</button></div>
              </form>
            ) : (LEGACY as readonly string[]).includes(item.type) ? (
              <ModuleForm action={createModule.bind(null, slug)} courseId={validCourse?.id} initialType={item.type as (typeof LEGACY)[number]} lockType />
            ) : null}
          </div>
        </>
      )}
    </PortalShell>
  );
}
