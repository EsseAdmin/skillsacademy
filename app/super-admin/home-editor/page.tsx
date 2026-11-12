import Link from "next/link";
import { requireSuperAdminSession } from "@/lib/authz";
import { MarketingPages } from "@/lib/queries";
import { isAiConfigured } from "@/lib/ai";
import { loadDraftHome } from "@/lib/marketingContent";
import PortalShell from "@/components/PortalShell";
import HomeEditor from "@/components/HomeEditor";
import { SUPER_ADMIN_NAV } from "@/lib/nav";
import { saHref } from "@/lib/superAdminPath";

export const dynamic = "force-dynamic";

export default async function HomeEditorPage() {
  const session = await requireSuperAdminSession();
  const { page, hasDraft } = await loadDraftHome();
  const row = await MarketingPages.get();
  const versions = (await MarketingPages.versions()).map((v) => ({ id: v.id, publishedAt: v.published_at }));

  return (
    <PortalShell
      brandName="SkillsAcademy.ai"
      brandTag="Platform Admin"
      themeStyle={{ ["--brand-primary" as never]: "#0B1F3B", ["--brand-secondary" as never]: "#12294d", ["--brand-accent" as never]: "#FBCB07" }}
      navItems={SUPER_ADMIN_NAV()}
      activeHref={saHref("/super-admin/home-editor")}
      userName={session.name}
      userRoleLabel="Super Admin"
      logoutRedirect={saHref("/super-admin/login")}
    >
      <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Home page</h1>
          <p className="text-gray-500 text-sm max-w-2xl">
            Re-design and edit the public skillsacademy.ai home page: change any text or picture, reorder, hide or add sections, and change the colours, menu and footer.
            Your changes stay a private draft until you press <b>Publish</b>.
          </p>
        </div>
        <Link href="/" target="_blank" rel="noreferrer" className="text-sm font-semibold rounded-md px-4 py-2 border border-gray-300 hover:bg-gray-50">
          View the live page ↗
        </Link>
      </div>
      <HomeEditor initialPage={page} hasDraft={hasDraft} publishedAt={row?.published_at ?? null} versions={versions} aiEnabled={isAiConfigured()} previewHref={saHref("/super-admin/home-editor/preview")} />
    </PortalShell>
  );
}
