// SEO/marketing feature gating by subscription plan (confirmed split):
//   Starter    — page title/meta description per course, auto sitemap.xml
//   Growth     — + OG share image per course, schema.org structured data,
//                UTM-tagged shareable enrollment links
//   Enterprise — + social post copy drafts (Facebook/LinkedIn/X),
//                Google/Meta ad snippet generator
//
// Higher tiers include everything below them. Gating is enforced both here
// (server actions call requireSeoTier before writing) and in the UI (locked
// panels show an upgrade prompt instead of the controls).
export type SeoTier = "starter" | "growth" | "enterprise";

const TIER_RANK: Record<SeoTier, number> = { starter: 1, growth: 2, enterprise: 3 };

export function planKeyToSeoTier(planKey: string): SeoTier {
  if (planKey === "growth" || planKey === "enterprise") return planKey;
  return "starter";
}

export function hasSeoTier(planKey: string, required: SeoTier): boolean {
  return TIER_RANK[planKeyToSeoTier(planKey)] >= TIER_RANK[required];
}

export class SeoTierError extends Error {
  constructor(feature: string, required: SeoTier) {
    super(`"${feature}" requires the ${required} plan or higher.`);
  }
}
