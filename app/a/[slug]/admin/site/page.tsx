import Link from "next/link";
import { notFound } from "next/navigation";
import { Academies, Templates, Courses, SiteBlocks } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { themeVars } from "@/lib/theme";
import PortalShell from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import AcademyPublicSite from "@/components/AcademyPublicSite";
import SiteBlockForm from "@/components/SiteBlockForm";
import SiteBlockEditForm from "@/components/SiteBlockEditForm";
import { ADMIN_NAV } from "@/lib/nav";
import { updateSiteContent, togglePublish } from "@/lib/actions/settings";
import {
  createSiteBlock,
  updateSiteBlock,
  toggleSiteBlockPublished,
  moveSiteBlock,
  deleteSiteBlock,
} from "@/lib/actions/siteBlocks";

const BLOCK_ICON: Record<string, string> = { TEXT: "📝", IMAGE: "🖼️", VIDEO: "🎬", NEWS: "📰" };

export default async function AcademySitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const template = (await Templates.byId(academy.template_id))!;
  const courses = await Courses.listByAcademy(academy.id, true);
  const siteBlocks = await SiteBlocks.listByAcademy(academy.id);

  const boundUpdateSite = updateSiteContent.bind(null, slug);
  const boundTogglePublish = togglePublish.bind(null, slug);
  const boundCreateBlock = createSiteBlock.bind(null, slug);
  const boundUpdateBlock = updateSiteBlock.bind(null, slug);
  const boundToggleBlockPublished = toggleSiteBlockPublished.bind(null, slug);
  const boundMoveBlock = moveSiteBlock.bind(null, slug);
  const boundDeleteBlock = deleteSiteBlock.bind(null, slug);

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

      <div className="app-card p-6 mb-8">
        <h2 className="font-semibold text-gray-900 mb-1">Homepage content</h2>
        <p className="text-gray-500 text-sm mb-4">
          Build out your public homepage with your own text sections, images, videos, and news posts — shown between
          the About section and your course catalog, in the order below.
        </p>

        {siteBlocks.length > 0 && (
          <div className="grid gap-3 mb-6">
            {siteBlocks.map((b, i) => (
              <div key={b.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-semibold text-gray-900 flex items-center gap-2">
                      <span>{BLOCK_ICON[b.block_type]}</span> {b.title}
                      {!b.is_published && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">
                          Hidden
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 capitalize">{b.block_type.toLowerCase()} section</div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <form action={boundMoveBlock}>
                      <input type="hidden" name="blockId" value={b.id} />
                      <input type="hidden" name="direction" value="up" />
                      <button
                        type="submit"
                        disabled={i === 0}
                        title="Move up"
                        className="text-xs rounded-md px-2 py-1 border border-gray-300 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        ↑
                      </button>
                    </form>
                    <form action={boundMoveBlock}>
                      <input type="hidden" name="blockId" value={b.id} />
                      <input type="hidden" name="direction" value="down" />
                      <button
                        type="submit"
                        disabled={i === siteBlocks.length - 1}
                        title="Move down"
                        className="text-xs rounded-md px-2 py-1 border border-gray-300 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        ↓
                      </button>
                    </form>
                    <form action={boundToggleBlockPublished}>
                      <input type="hidden" name="blockId" value={b.id} />
                      <button type="submit" className="text-xs font-semibold rounded-md px-3 py-1 border border-gray-300 hover:bg-gray-50">
                        {b.is_published ? "Hide" : "Show"}
                      </button>
                    </form>
                    <form action={boundDeleteBlock}>
                      <input type="hidden" name="blockId" value={b.id} />
                      <button type="submit" className="text-xs text-gray-400 hover:text-red-600 px-2 py-1">
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
                <details className="mt-2">
                  <summary className="text-xs font-semibold app-link cursor-pointer select-none list-none">✏️ Edit</summary>
                  <SiteBlockEditForm action={boundUpdateBlock} block={b} />
                </details>
              </div>
            ))}
          </div>
        )}

        <div className="pt-4 border-t border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Add a section</h3>
          <SiteBlockForm action={boundCreateBlock} />
        </div>
      </div>

      <div>
        <h2 className="font-semibold text-gray-900 mb-3">Preview</h2>
        <p className="text-xs text-gray-500 mb-4">
          This reflects your last saved changes — save the form above to update it.
        </p>
        <div className="app-card overflow-hidden">
          <AcademyPublicSite slug={slug} academy={academy} template={template} courses={courses} siteBlocks={siteBlocks} preview />
        </div>
      </div>
    </PortalShell>
  );
}
