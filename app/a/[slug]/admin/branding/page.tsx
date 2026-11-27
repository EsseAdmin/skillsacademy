import { notFound } from "next/navigation";
import { Academies, Templates } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { themeVars } from "@/lib/theme";
import PortalShell from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import { ADMIN_NAV } from "@/lib/nav";
import { updateBranding, createCustomTemplate, deleteCustomTemplate } from "@/lib/actions/settings";

export default async function BrandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const template = (await Templates.byId(academy.template_id))!;
  // Presets plus this academy's own custom templates.
  const templates = await Templates.all(academy.id);
  const boundUpdate = updateBranding.bind(null, slug);
  const boundCreate = createCustomTemplate.bind(null, slug);
  const boundDelete = deleteCustomTemplate.bind(null, slug);

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
      <p className="text-gray-500 text-sm mb-8">
        Choose the design template used across your academy portals, or create your own.
      </p>

      <div className="grid md:grid-cols-3 gap-4">
        {templates.map((t) => (
          <div key={t.key} className="relative">
            <form action={boundUpdate}>
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
                  {t.academy_id && (
                    <span className="absolute top-2 left-2 text-[10px] bg-white/90 rounded-full px-2 py-0.5 font-semibold text-gray-700">
                      Your template
                    </span>
                  )}
                </div>
                <div className="app-card border-t-0 p-4">
                  <div className="font-semibold text-sm text-gray-900 mb-1">{t.name}</div>
                  <div className="text-xs text-gray-500 leading-relaxed">{t.description}</div>
                </div>
              </button>
            </form>
            {t.academy_id === academy.id && t.id !== template.id && (
              <form action={boundDelete} className="absolute bottom-3 right-3">
                <input type="hidden" name="templateId" value={t.id} />
                <button type="submit" className="text-xs text-gray-400 hover:text-red-600 bg-white/90 rounded px-2 py-0.5">
                  Delete
                </button>
              </form>
            )}
          </div>
        ))}
      </div>

      <div className="app-card p-6 mt-8 max-w-xl">
        <h2 className="font-semibold text-gray-900 mb-1">Create your own template</h2>
        <p className="text-xs text-gray-500 mb-4">
          Pick your own colours and heading font. It&apos;ll be saved alongside the presets above, just for your
          academy, and applied as soon as you create it.
        </p>
        <form action={boundCreate} className="grid gap-4">
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Template name
            <input name="name" required className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="e.g. Our Brand Colours" />
          </label>
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Description (optional)
            <input name="description" className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="A short note about this look" />
          </label>
          <div className="grid grid-cols-3 gap-3">
            <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
              Primary colour
              <input name="primary_color" type="color" defaultValue="#0B1F3B" className="h-10 w-full rounded-md border border-gray-300 p-1" />
            </label>
            <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
              Secondary colour
              <input name="secondary_color" type="color" defaultValue="#1E293B" className="h-10 w-full rounded-md border border-gray-300 p-1" />
            </label>
            <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
              Accent colour
              <input name="accent_color" type="color" defaultValue="#D4AF37" className="h-10 w-full rounded-md border border-gray-300 p-1" />
            </label>
          </div>
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Heading font
            <select name="font_heading" className="rounded-md border border-gray-300 px-3 py-2 text-sm" defaultValue="Inter">
              <option value="Inter">Inter</option>
              <option value="Poppins">Poppins</option>
              <option value="Montserrat">Montserrat</option>
              <option value="Playfair Display">Playfair Display</option>
              <option value="Georgia">Georgia</option>
              <option value="Arial">Arial</option>
            </select>
          </label>
          <div>
            <button type="submit" className="app-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold">
              Create &amp; apply template
            </button>
          </div>
        </form>
      </div>
    </PortalShell>
  );
}
