import { requireSuperAdminSession } from "@/lib/authz";
import { PlatformSettings } from "@/lib/queries";
import PortalShell from "@/components/PortalShell";
import { SUPER_ADMIN_NAV } from "@/lib/nav";
import { updatePlatformSettings } from "@/lib/actions/superadmin";

export default async function SuperAdminSettingsPage() {
  const session = await requireSuperAdminSession();
  const settings = await PlatformSettings.all();

  return (
    <PortalShell
      brandName="SkillsAcademy.ai"
      brandTag="Platform Admin"
      themeStyle={{ ["--brand-primary" as never]: "#0B1F3B", ["--brand-secondary" as never]: "#12294d", ["--brand-accent" as never]: "#FBCB07" }}
      navItems={SUPER_ADMIN_NAV}
      activeHref="/super-admin/settings"
      userName={session.name}
      userRoleLabel="Super Admin"
      logoutRedirect="/super-admin/login"
    >
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Platform Settings</h1>
      <p className="text-gray-500 text-sm mb-8">Control platform-wide functionality for every academy.</p>

      <div className="app-card p-6 max-w-xl">
        <form action={updatePlatformSettings} className="grid gap-5">
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Platform name
            <input name="platform_name" defaultValue={settings.platform_name || "SkillsAcademy.ai"} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </label>

          <Toggle name="new_signups_enabled" label="Allow new academy signups" checked={settings.new_signups_enabled === "true"} />
          <Toggle name="certificates_enabled" label="Enable completion certificates feature" checked={settings.certificates_enabled === "true"} />
          <Toggle name="charity_discount_enabled" label="Enable charity/public-sector discount pricing" checked={settings.charity_discount_enabled === "true"} />
          <Toggle name="maintenance_mode" label="Maintenance mode (shows banner platform-wide)" checked={settings.maintenance_mode === "true"} />

          <div>
            <button type="submit" className="app-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold">
              Save Settings
            </button>
          </div>
        </form>
      </div>
    </PortalShell>
  );
}

function Toggle({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label className="flex items-center gap-3 text-sm text-gray-700 border border-gray-200 rounded-md px-4 py-3">
      <input type="checkbox" name={name} defaultChecked={checked} className="h-4 w-4" />
      {label}
    </label>
  );
}
