import "./marketing.css";
import { MarketingNav, MarketingFooter, themeStyle } from "@/components/MarketingSections";
import { loadPublishedHome, loadHomeData } from "@/lib/marketingContent";

// The navigation and footer come from the home page the super admin publishes
// (Super Admin → Home page), so they stay the same on the sign-up and log-in pages.
export const dynamic = "force-dynamic";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const page = await loadPublishedHome();
  const { ctx } = await loadHomeData();
  return (
    <div className="marketing" style={themeStyle(page)}>
      <MarketingNav page={page} />
      {children}
      <MarketingFooter page={page} ctx={ctx} />
    </div>
  );
}
