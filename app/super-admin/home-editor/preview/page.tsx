import type { Metadata } from "next";
import "../../../(marketing)/marketing.css";
import { requireSuperAdminSession } from "@/lib/authz";
import { loadDraftHome, loadHomeData } from "@/lib/marketingContent";
import { MarketingNav, MarketingFooter, MarketingSections, themeStyle } from "@/components/MarketingSections";

// The super admin's saved draft of the home page, with the same navigation and footer
// as the public site. Shown inside the editor's Preview tab; never indexed.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Home page preview", robots: { index: false, follow: false } };

export default async function HomePreviewPage() {
  await requireSuperAdminSession();
  const { page } = await loadDraftHome();
  const { plans, ctx } = await loadHomeData();
  return (
    <div className="marketing" style={themeStyle(page)} data-testid="home-preview">
      <MarketingNav page={page} />
      <MarketingSections page={page} plans={plans} ctx={ctx} />
      <MarketingFooter page={page} ctx={ctx} />
    </div>
  );
}
