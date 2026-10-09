import { notFound } from "next/navigation";
import { Academies, Templates } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { themeVars } from "@/lib/theme";
import PortalShell from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import { ADMIN_NAV } from "@/lib/nav";
import { updateAcademyProfile } from "@/lib/actions/settings";
import { platformCnameTarget } from "@/lib/platformDomains";
import CustomDomainSettings from "@/components/CustomDomainSettings";

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const template = (await Templates.byId(academy.template_id))!;
  const boundUpdate = updateAcademyProfile.bind(null, slug);
  const cnameTarget = platformCnameTarget();

  return (
    <PortalShell
      brandName={academy.logo_text}
      brandTag="Academy Admin"
      themeStyle={themeVars(template)}
      navItems={ADMIN_NAV(slug)}
      activeHref={`/a/${slug}/admin/settings`}
      userName={session.name}
      userRoleLabel="Academy Admin"
      logoutRedirect={`/a/${slug}/login`}
      trialBanner={<TrialBanner academy={academy} slug={slug} showManage />}
    >
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Academy Settings</h1>
      <p className="text-gray-500 text-sm mb-8">Manage your academy&apos;s profile.</p>

      <div className="app-card p-6 max-w-lg">
        <form action={boundUpdate} className="grid gap-4">
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Academy name
            <input name="name" defaultValue={academy.name} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Display name (shown in sidebar)
            <input name="logo_text" defaultValue={academy.logo_text} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Academy web address
            <input disabled defaultValue={`skillsacademy.ai/a/${academy.slug}`} className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-400" />
          </label>
          <div>
            <button type="submit" className="app-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold">
              Save Changes
            </button>
          </div>
        </form>
      </div>

      <CustomDomainSettings academy={academy} slug={slug} cnameTarget={cnameTarget} />
    </PortalShell>
  );
}
