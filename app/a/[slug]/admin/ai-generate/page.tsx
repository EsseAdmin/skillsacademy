import { notFound } from "next/navigation";
import { Academies, Templates } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { themeVars } from "@/lib/theme";
import { isAiConfigured } from "@/lib/ai";
import PortalShell from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import AiGenerateForm from "@/components/AiGenerateForm";
import { ADMIN_NAV } from "@/lib/nav";

export default async function AiGeneratePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const template = (await Templates.byId(academy.template_id))!;

  return (
    <PortalShell
      brandName={academy.logo_text}
      brandTag="Academy Admin"
      themeStyle={themeVars(template)}
      navItems={ADMIN_NAV(slug)}
      activeHref={`/a/${slug}/admin/ai-generate`}
      userName={session.name}
      userRoleLabel="Academy Admin"
      logoutRedirect={`/a/${slug}/login`}
      trialBanner={<TrialBanner academy={academy} slug={slug} showManage />}
    >
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Generate with AI</h1>
      <p className="text-gray-500 text-sm mb-8">
        Describe a look or a course in plain language and we&apos;ll draft it — you review it before anything is
        added, and everything it creates works with the same Branding, Courses, and Academy Site tools you&apos;d use
        manually.
      </p>

      {isAiConfigured() ? (
        <AiGenerateForm slug={slug} />
      ) : (
        <div className="app-card p-6 max-w-2xl">
          <h2 className="font-semibold text-gray-900 mb-2">AI generation isn&apos;t set up yet</h2>
          <p className="text-sm text-gray-600">
            This platform doesn&apos;t have an <code>ANTHROPIC_API_KEY</code> configured yet, so this tool can&apos;t
            reach the AI. Ask your platform administrator to add one — until then, you can still set everything up
            manually via Branding, Courses, and Academy Site.
          </p>
        </div>
      )}
    </PortalShell>
  );
}
