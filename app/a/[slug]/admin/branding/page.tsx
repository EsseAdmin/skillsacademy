import { notFound } from "next/navigation";
import { Academies, Templates } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { themeVars } from "@/lib/theme";
import PortalShell from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import { ADMIN_NAV } from "@/lib/nav";
import { updateBranding } from "@/lib/actions/settings";

export default async function BrandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const template = (await Templates.byId(academy.template_id))!;
  const templates = await Templates.all();
  const boundUpdate = updateBranding.bind(null, slug);

  return (
    <PortalShell
      brandName={academy.logo_text}
      brandTag="Academy Admin"
      themeStyle={themeVars(template)}
      navItems={ADMIN_NAV(slug)}
      activeHref={`/a/${slug}/admin/branding`}
      userName={session.name}
      userRoleLabel="Academy Admin"
      logoutRedirect={`/a/${slug}/login`}
      trialBanner={<TrialBanner academy={academy} slug={slug} showManage />}
    >
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Branding</h1>
      <p className="text-gray-500 text-sm mb-8">Choose the design template used across your academy portals.</p>

      <div className="grid md:grid-cols-3 gap-4">
        {templates.map((t) => (
          <form action={boundUpdate} key={t.key}>
            <input type="hidden" name="template" value={t.key} />
            <button
              type="submit"
              className="w-full text-left rounded-lg overflow-hidden border-2 transition"
              style={{ borderColor: t.id === template.id ? t.accent_color : "transparent" }}
            >
              <div
                className="h-24 relative"
                style={{ background: `linear-gradient(135deg, ${t.primary_color}, ${t.secondary_color})` }}
              >
                <div className="absolute bottom-2 left-3 w-8 h-2 rounded" style={{ background: t.accent_color }} />
                {t.id === template.id && (
                  <span className="absolute top-2 right-2 text-xs bg-white/90 rounded-full px-2 py-0.5 font-semibold">
                    Active
                  </span>
                )}
              </div>
              <div className="app-card border-t-0 p-4">
                <div className="font-semibold text-sm text-gray-900 mb-1">{t.name}</div>
                <div className="text-xs text-gray-500 leading-relaxed">{t.description}</div>
              </div>
            </button>
          </form>
        ))}
      </div>
    </PortalShell>
  );
}
