import Link from "next/link";
import { notFound } from "next/navigation";
import { Academies, Templates, Courses } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { themeVars } from "@/lib/theme";
import PortalShell from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import AcademyPublicSite from "@/components/AcademyPublicSite";
import { ADMIN_NAV } from "@/lib/nav";
import { updateSiteContent, togglePublish } from "@/lib/actions/settings";

export default async function AcademySitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const template = (await Templates.byId(academy.template_id))!;
  const courses = await Courses.listByAcademy(academy.id, true);

  const boundUpdateSite = updateSiteContent.bind(null, slug);
  const boundTogglePublish = togglePublish.bind(null, slug);

  return (
    <PortalShell
      brandName={academy.logo_text}
      brandTag="Academy Admin"
      themeStyle={themeVars(template)}
      navItems={ADMIN_NAV(slug)}
      activeHref={`/a/${slug}/admin/site`}
      userName={session.name}
      userRoleLabel="Academy Admin"
      logoutRedirect={`/a/${slug}/login`}
      trialBanner={<TrialBanner academy={academy} slug={slug} showManage />}
    >
      <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Academy Site</h1>
          <p className="text-gray-500 text-sm">
            Edit the public page prospective learners see, and control whether it&apos;s live.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`text-xs px-3 py-1.5 rounded-full font-semibold ${
              academy.is_published ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"
            }`}
          >
            {academy.is_published ? "● Published" : "○ Not published"}
          </span>
          <Link
            href={`/a/${slug}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-semibold rounded-md px-4 py-2 border border-gray-300 hover:bg-gray-50"
          >
            View live site ↗
          </Link>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <div className="app-card p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Publish status</h2>
          <p className="text-sm text-gray-500 mb-4">
            {academy.is_published
              ? `Your academy site is live at skillsacademy.ai/a/${academy.slug}. Anyone can view it — enrolling still requires signing in.`
              : "Your academy site is only visible to you until you publish it. Use the preview below to check it looks right first."}
          </p>
          <form action={boundTogglePublish}>
            <input type="hidden" name="publish" value={academy.is_published ? "0" : "1"} />
            <button
              type="submit"
              className={`rounded-md px-5 py-2.5 text-sm font-semibold ${
                academy.is_published
                  ? "border border-red-200 text-red-600 hover:bg-red-50"
                  : "app-btn-primary"
              }`}
            >
              {academy.is_published ? "Unpublish site" : "Publish site"}
            </button>
          </form>
        </div>

        <div className="app-card p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Edit page content</h2>
          <form action={boundUpdateSite} className="grid gap-4">
            <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
              Headline
              <input
                name="hero_headline"
                defaultValue={academy.hero_headline}
                placeholder={academy.name}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
              Tagline
              <input
                name="hero_tagline"
                defaultValue={academy.hero_tagline}
                placeholder={`Welcome to ${academy.name} — browse our courses and sign in to start learning.`}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
              About text
              <textarea
                name="about_text"
                rows={4}
                defaultValue={academy.about_text}
                placeholder={`${academy.name} runs its training and development programme right here.`}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <div className="flex items-center justify-between">
              <button type="submit" className="app-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold">
                Save Changes
              </button>
              <Link href={`/a/${slug}/admin/branding`} className="text-xs app-link font-semibold">
                Change template &amp; colours →
              </Link>
            </div>
          </form>
        </div>
      </div>

      <div>
        <h2 className="font-semibold text-gray-900 mb-3">Preview</h2>
        <p className="text-xs text-gray-500 mb-4">
          This reflects your last saved changes — save the form above to update it.
        </p>
        <div className="app-card overflow-hidden">
          <AcademyPublicSite slug={slug} academy={academy} template={template} courses={courses} preview />
        </div>
      </div>
    </PortalShell>
  );
}
