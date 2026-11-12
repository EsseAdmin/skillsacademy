import Link from "next/link";
import { notFound } from "next/navigation";
import { Academies, AcademyPages, Templates } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { themeVars } from "@/lib/theme";
import { isAiConfigured } from "@/lib/ai";
import { loadDesignerState } from "@/lib/academyPageContent";
import PortalShell from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import AcademyDesigner from "@/components/AcademyDesigner";
import { ADMIN_NAV } from "@/lib/nav";

// Available to every academy on every plan, including during the trial; academy admins only.
export const dynamic = "force-dynamic";

export default async function PageDesignerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const template = (await Templates.byId(academy.template_id))!;
  const state = await loadDesignerState(academy, session.userId);
  const versions = (await AcademyPages.versions(academy.id)).map((v) => ({ id: v.id, publishedAt: v.published_at }));

  return (
    <PortalShell
      brandName={academy.logo_text}
      brandTag="Academy Admin"
      themeStyle={themeVars(template)}
      navItems={ADMIN_NAV(slug)}
      activeHref={`/a/${slug}/admin/designer`}
      userName={session.name}
      userRoleLabel="Academy Admin"
      logoutRedirect={`/a/${slug}/login`}
      trialBanner={<TrialBanner academy={academy} slug={slug} showManage />}
    >
      <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Page designer</h1>
          <p className="text-gray-500 text-sm max-w-2xl">
            Design your academy&apos;s public page: change any text or picture, move sections up and down, add videos, news, your courses and learning journeys, and set your own colours and fonts. Your changes stay a private draft until you press <b>Publish</b>.
            {!academy.is_published && (
              <>
                {" "}
                Your academy site itself isn&apos;t published yet — switch it on under <Link className="app-link font-semibold" href={`/a/${slug}/admin/site`}>Academy Site</Link>.
              </>
            )}
          </p>
        </div>
        <Link href={`/a/${slug}`} target="_blank" rel="noreferrer" className="text-sm font-semibold rounded-md px-4 py-2 border border-gray-300 hover:bg-gray-50">
          View the live page ↗
        </Link>
      </div>
      <AcademyDesigner
        slug={slug}
        academyName={academy.name}
        initialPage={state.page}
        hasDraft={state.hasDraft}
        isLive={state.isLive}
        publishedAt={state.publishedAt}
        versions={versions}
        aiEnabled={isAiConfigured()}
        siteIsPublished={!!academy.is_published}
        brand={{ primary: template.primary_color, secondary: template.secondary_color, accent: template.accent_color }}
      />
    </PortalShell>
  );
}
