import { Academies, Templates, Courses, Plans } from "@/lib/queries";
import { themeVars } from "@/lib/theme";
import PortalShell from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import UtmLinkGenerator from "@/components/UtmLinkGenerator";
import { updateCourseSeoMeta, uploadCourseOgImage, generateMarketingCopy } from "@/lib/actions/seo";
import { hasSeoTier } from "@/lib/seoTiers";
import type { SessionPayload } from "@/lib/auth";
import type { NavItem } from "@/components/PortalShell";

const TIER_LABEL: Record<string, string> = { starter: "Starter", growth: "Growth", enterprise: "Enterprise" };

function UpgradeNotice({ tier }: { tier: string }) {
  return (
    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
      Available on the {TIER_LABEL[tier]} plan and above. Upgrade from Billing to unlock this.
    </div>
  );
}

export default async function MarketingPage({
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
  const plan = (await Plans.byId(academy.plan_id))!;
  const courses = await Courses.listByAcademy(academy.id);
  const activeCourse = courses.find((c) => c.id === courseId) || courses[0];

  const canGrowth = hasSeoTier(plan.key, "growth");
  const canEnterprise = hasSeoTier(plan.key, "enterprise");

  const boundUpdateMeta = updateCourseSeoMeta.bind(null, slug);
  const boundUploadOg = uploadCourseOgImage.bind(null, slug);
  const boundGenerateCopy = generateMarketingCopy.bind(null, slug);

  const publicUrl = activeCourse ? `${process.env.APP_BASE_URL || ""}/a/${slug}/courses/${activeCourse.id}` : "";
  const socialCopy = activeCourse?.seo_social_copy_json ? JSON.parse(activeCourse.seo_social_copy_json) : null;
  const adSnippets = activeCourse?.seo_ad_snippet_json ? JSON.parse(activeCourse.seo_ad_snippet_json) : null;

  return (
    <PortalShell
      brandName={academy.logo_text}
      brandTag={area === "admin" ? "Academy Admin" : "Instructor"}
      themeStyle={themeVars(template)}
      navItems={navItems}
      activeHref={`/a/${slug}/${area}/marketing`}
      userName={session.name}
      userRoleLabel={area === "admin" ? "Academy Admin" : "Instructor"}
      logoutRedirect={`/a/${slug}/login`}
      trialBanner={<TrialBanner academy={academy} slug={slug} showManage={area === "admin"} />}
    >
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-gray-900">SEO &amp; Marketing</h1>
        <span className="text-xs font-semibold rounded-full px-3 py-1 bg-gray-100 text-gray-700">
          {TIER_LABEL[plan.key] || plan.name} plan
        </span>
      </div>
      <p className="text-gray-500 text-sm mb-8">
        Manage how each course appears in search engines and social shares. Auto-generated sitemap:{" "}
        <a href={`/a/${slug}/sitemap.xml`} className="app-link" target="_blank" rel="noreferrer">
          /a/{slug}/sitemap.xml
        </a>
      </p>

      {courses.length === 0 ? (
        <p className="text-sm text-gray-500">Create a course first.</p>
      ) : (
        <>
          <div className="app-card p-4 mb-6">
            <form method="GET" className="flex gap-2 items-end">
              <label className="text-xs font-semibold text-gray-600 grid gap-1.5 flex-1 max-w-sm">
                Course
                <select name="courseId" defaultValue={activeCourse?.id} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="rounded-md px-4 py-2 text-sm font-semibold border border-gray-300 hover:bg-gray-50">
                View
              </button>
            </form>
          </div>

          {activeCourse && (
            <div className="space-y-6">
              <div className="app-card p-6">
                <h2 className="font-semibold text-gray-900 mb-1">Search appearance</h2>
                <p className="text-xs text-gray-500 mb-4">Included on the Starter plan. Public page: /a/{slug}/courses/{activeCourse.id}</p>
                <form action={boundUpdateMeta} className="grid gap-4">
                  <input type="hidden" name="courseId" value={activeCourse.id} />
                  <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
                    Page title
                    <input name="seo_meta_title" defaultValue={activeCourse.seo_meta_title || ""} className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder={activeCourse.title} />
                  </label>
                  <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
                    Meta description
                    <textarea name="seo_meta_description" rows={2} defaultValue={activeCourse.seo_meta_description || ""} className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder={activeCourse.description} />
                  </label>
                  <div>
                    <button type="submit" className="rounded-md px-4 py-2 text-sm font-semibold border border-gray-300 hover:bg-gray-50">
                      Save
                    </button>
                  </div>
                </form>
              </div>

              <div className="app-card p-6">
                <h2 className="font-semibold text-gray-900 mb-1">Social share &amp; structured data</h2>
                <p className="text-xs text-gray-500 mb-4">Growth plan and above.</p>
                {canGrowth ? (
                  <div className="grid gap-6">
                    <form action={boundUploadOg} className="grid gap-3">
                      <input type="hidden" name="courseId" value={activeCourse.id} />
                      <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
                        Social share image (used for Facebook/LinkedIn/X link previews)
                        <input name="image" type="file" accept="image/*" className="rounded-md border border-gray-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs" />
                      </label>
                      {activeCourse.seo_og_image_path && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/courses/${activeCourse.id}/og-image`} alt="" className="h-24 rounded-md border border-gray-200 object-cover w-auto" />
                      )}
                      <div>
                        <button type="submit" className="rounded-md px-4 py-2 text-sm font-semibold border border-gray-300 hover:bg-gray-50">
                          Upload
                        </button>
                      </div>
                    </form>

                    <div>
                      <div className="text-xs font-semibold text-gray-600 mb-2">Shareable link with tracking (UTM)</div>
                      <UtmLinkGenerator baseUrl={publicUrl} />
                    </div>

                    <p className="text-xs text-gray-400">
                      schema.org Course structured data is injected automatically on the public course page — no
                      setup needed.
                    </p>
                  </div>
                ) : (
                  <UpgradeNotice tier="growth" />
                )}
              </div>

              <div className="app-card p-6">
                <h2 className="font-semibold text-gray-900 mb-1">Social post &amp; ad copy drafts</h2>
                <p className="text-xs text-gray-500 mb-4">Enterprise plan.</p>
                {canEnterprise ? (
                  <div className="grid gap-4">
                    <form action={boundGenerateCopy}>
                      <input type="hidden" name="courseId" value={activeCourse.id} />
                      <button type="submit" className="rounded-md px-4 py-2 text-sm font-semibold border border-gray-300 hover:bg-gray-50">
                        {socialCopy ? "Regenerate drafts" : "Generate drafts"}
                      </button>
                    </form>
                    {socialCopy && (
                      <div className="grid md:grid-cols-3 gap-3 text-xs">
                        <div className="border border-gray-200 rounded-md p-3">
                          <div className="font-semibold text-gray-700 mb-1">Facebook</div>
                          <p className="whitespace-pre-line text-gray-600">{socialCopy.facebook}</p>
                        </div>
                        <div className="border border-gray-200 rounded-md p-3">
                          <div className="font-semibold text-gray-700 mb-1">LinkedIn</div>
                          <p className="whitespace-pre-line text-gray-600">{socialCopy.linkedin}</p>
                        </div>
                        <div className="border border-gray-200 rounded-md p-3">
                          <div className="font-semibold text-gray-700 mb-1">X</div>
                          <p className="whitespace-pre-line text-gray-600">{socialCopy.x}</p>
                        </div>
                      </div>
                    )}
                    {adSnippets && (
                      <div className="grid gap-2 text-xs">
                        <div className="font-semibold text-gray-700">Google Ads headline/description variants</div>
                        {adSnippets.google.map((g: { headline: string; description: string }, i: number) => (
                          <div key={i} className="border border-gray-200 rounded-md p-3">
                            <div className="font-medium text-gray-900">{g.headline}</div>
                            <div className="text-gray-500">{g.description}</div>
                          </div>
                        ))}
                        <div className="font-semibold text-gray-700 mt-2">Meta ad snippet</div>
                        {adSnippets.meta.map((m: { headline: string; primaryText: string; description: string }, i: number) => (
                          <div key={i} className="border border-gray-200 rounded-md p-3">
                            <div className="font-medium text-gray-900">{m.headline}</div>
                            <div className="text-gray-600">{m.primaryText}</div>
                            <div className="text-gray-500">{m.description}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <UpgradeNotice tier="enterprise" />
                )}
              </div>
            </div>
          )}
        </>
      )}
    </PortalShell>
  );
}
