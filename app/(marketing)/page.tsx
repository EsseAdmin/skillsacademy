import type { Metadata } from "next";
import { MarketingSections } from "@/components/MarketingSections";
import { loadPublishedHome, loadHomeData } from "@/lib/marketingContent";

// Always rendered from the database so a trial length changed by the super admin,
// or a home page they just published, shows up straight away rather than after the next deploy.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const page = await loadPublishedHome();
  const meta: Metadata = {};
  if (page.seo.title) meta.title = page.seo.title;
  if (page.seo.description) meta.description = page.seo.description;
  return meta;
}

export default async function HomePage() {
  const page = await loadPublishedHome();
  const { plans, ctx } = await loadHomeData();
  return <MarketingSections page={page} plans={plans} ctx={ctx} />;
}
