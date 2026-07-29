import { notFound } from "next/navigation";
import { Academies, Templates, AcademyIntegrations } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { themeVars } from "@/lib/theme";
import PortalShell from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import { ADMIN_NAV } from "@/lib/nav";
import { connectZoom, connectMicrosoft, disconnectIntegration } from "@/lib/actions/integrations";
import { isZoomConfigured } from "@/lib/integrations/zoom";
import { isMicrosoftConfigured } from "@/lib/integrations/microsoft";

const ERROR_LABELS: Record<string, string> = {
  invalid_state: "That connection link expired or was invalid — please try again.",
  zoom_connect_failed: "Zoom didn't confirm the connection — please try again.",
  microsoft_connect_failed: "Microsoft didn't confirm the connection — please try again.",
  access_denied: "The consent screen was cancelled.",
};

export default async function IntegrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { slug } = await params;
  const { connected, error } = await searchParams;
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const template = (await Templates.byId(academy.template_id))!;

  const zoomIntegration = await AcademyIntegrations.byAcademyAndProvider(academy.id, "zoom");
  const msIntegration = await AcademyIntegrations.byAcademyAndProvider(academy.id, "microsoft");

  const boundConnectZoom = connectZoom.bind(null, slug);
  const boundConnectMs = connectMicrosoft.bind(null, slug);
  const boundDisconnect = disconnectIntegration.bind(null, slug);

  return (
    <PortalShell
      brandName={academy.logo_text}
      brandTag="Academy Admin"
      themeStyle={themeVars(template)}
      navItems={ADMIN_NAV(slug)}
      activeHref={`/a/${slug}/admin/integrations`}
      userName={session.name}
      userRoleLabel="Academy Admin"
      logoutRedirect={`/a/${slug}/login`}
      trialBanner={<TrialBanner academy={academy} slug={slug} showManage={false} />}
    >
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Live Classes</h1>
      <p className="text-gray-500 text-sm mb-8">
        Connect your Zoom or Microsoft Teams account so instructors can create live-class modules that
        automatically generate a real meeting link.
      </p>

      {connected && (
        <div className="mb-6 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 px-5 py-4 text-sm">
          ✅ {connected === "zoom" ? "Zoom" : "Microsoft Teams"} connected successfully.
        </div>
      )}
      {error && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 text-red-800 px-5 py-4 text-sm">
          {ERROR_LABELS[error] || `Something went wrong (${error}).`}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <div className="app-card p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">🔵 Zoom</h2>
            {zoomIntegration && (
              <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 rounded-full px-3 py-1">Connected</span>
            )}
          </div>
          {zoomIntegration ? (
            <>
              <p className="text-sm text-gray-600 mb-4">
                Connected as <span className="font-medium text-gray-900">{zoomIntegration.external_account_email}</span>
              </p>
              <form action={boundDisconnect}>
                <input type="hidden" name="provider" value="zoom" />
                <button type="submit" className="text-sm text-red-600 border border-red-200 rounded-md px-4 py-2 hover:bg-red-50">
                  Disconnect
                </button>
              </form>
            </>
          ) : isZoomConfigured() ? (
            <form action={boundConnectZoom}>
              <button type="submit" className="app-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold">
                Connect Zoom
              </button>
            </form>
          ) : (
            <p className="text-xs text-gray-400">
              Zoom isn&apos;t set up on this platform yet — ask the platform owner to configure ZOOM_CLIENT_ID /
              ZOOM_CLIENT_SECRET (see DEPLOYMENT.md).
            </p>
          )}
        </div>

        <div className="app-card p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">🟣 Microsoft Teams</h2>
            {msIntegration && (
              <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 rounded-full px-3 py-1">Connected</span>
            )}
          </div>
          {msIntegration ? (
            <>
              <p className="text-sm text-gray-600 mb-4">
                Connected as <span className="font-medium text-gray-900">{msIntegration.external_account_email}</span>
              </p>
              <form action={boundDisconnect}>
                <input type="hidden" name="provider" value="microsoft" />
                <button type="submit" className="text-sm text-red-600 border border-red-200 rounded-md px-4 py-2 hover:bg-red-50">
                  Disconnect
                </button>
              </form>
            </>
          ) : isMicrosoftConfigured() ? (
            <form action={boundConnectMs}>
              <button type="submit" className="app-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold">
                Connect Microsoft Teams
              </button>
            </form>
          ) : (
            <p className="text-xs text-gray-400">
              Microsoft Teams isn&apos;t set up on this platform yet — ask the platform owner to configure MS_CLIENT_ID /
              MS_CLIENT_SECRET (see DEPLOYMENT.md).
            </p>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-8">
        Once connected, instructors will see a &quot;Live Session&quot; option when creating a module — it
        automatically creates a real Zoom or Teams meeting and shares the join link with enrolled learners.
      </p>
    </PortalShell>
  );
}
