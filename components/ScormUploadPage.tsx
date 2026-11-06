import { Academies, Templates } from "@/lib/queries";
import { themeVars } from "@/lib/theme";
import PortalShell from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import { uploadScormPackage } from "@/lib/actions/scorm";
import type { SessionPayload } from "@/lib/auth";
import type { NavItem } from "@/components/PortalShell";

export default async function ScormUploadPage({
  slug,
  area,
  session,
  navItems,
  courseId,
}: {
  slug: string;
  area: "admin" | "instructor";
  session: SessionPayload;
  navItems: NavItem[];
  courseId?: string;
}) {
  const academy = (await Academies.bySlug(slug))!;
  const template = (await Templates.byId(academy.template_id))!;
  const boundUpload = uploadScormPackage.bind(null, slug);

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
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Upload a SCORM Package</h1>
      <p className="text-gray-500 text-sm mb-8">
        Upload a SCORM 1.2 or SCORM 2004 .zip exported from Articulate Storyline, Adobe Captivate, iSpring, or
        similar tools. It plays back in-browser and reports completion/score straight back to the learner&apos;s
        progress.
      </p>

      <div className="app-card p-6 max-w-2xl">
        <form action={boundUpload} className="grid gap-4">
          {courseId && <input type="hidden" name="courseId" value={courseId} />}
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Module title
            <input name="title" required className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="e.g. Manual Handling — Interactive Module" />
          </label>
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Short description
            <input name="description" className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="What does this module cover?" />
          </label>
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            SCORM package (.zip)
            <input
              name="file"
              type="file"
              accept=".zip"
              required
              className="rounded-md border border-gray-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs"
            />
          </label>
          <p className="text-xs text-gray-400">
            The .zip must contain an <code>imsmanifest.xml</code> at its root (or a single top-level folder) —
            that&apos;s the standard SCORM export format. Multi-SCO packages launch their first SCO.
          </p>
          <div>
            <button type="submit" className="app-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold">
              Upload &amp; Process
            </button>
          </div>
        </form>
      </div>
    </PortalShell>
  );
}
