import type { NavItem } from "@/components/PortalShell";
import { getT } from "@/lib/i18n";
import { saHref } from "@/lib/superAdminPath";

export const ADMIN_NAV = (slug: string): NavItem[] => [
  { href: `/a/${slug}/admin`, label: "Dashboard", icon: "📊" },
  { href: `/a/${slug}/admin/courses`, label: "Courses", icon: "📚" },
  { href: `/a/${slug}/admin/journeys`, label: "Learning Journeys", icon: "🚇" },
  { href: `/a/${slug}/admin/people`, label: "People", icon: "👥" },
  { href: `/a/${slug}/admin/analytics`, label: "Analytics", icon: "📈" },
  { href: `/a/${slug}/admin/branding`, label: "Branding", icon: "🎨" },
  { href: `/a/${slug}/admin/site`, label: "Academy Site", icon: "🌐" },
  { href: `/a/${slug}/admin/designer`, label: "Page designer", icon: "🖌️" },
  { href: `/a/${slug}/admin/ai-generate`, label: "Generate with AI", icon: "✨" },
  { href: `/a/${slug}/admin/content-agent`, label: "Content agent", icon: "🤖" },
  { href: `/a/${slug}/admin/marketing`, label: "SEO & Marketing", icon: "📣" },
  { href: `/a/${slug}/admin/billing`, label: "Billing", icon: "💳" },
  { href: `/a/${slug}/admin/settings`, label: "Settings", icon: "⚙️" },
];

export const INSTRUCTOR_NAV = (slug: string): NavItem[] => [
  { href: `/a/${slug}/instructor`, label: "Dashboard", icon: "📊" },
  { href: `/a/${slug}/instructor/courses`, label: "My Courses", icon: "📚" },
  { href: `/a/${slug}/instructor/modules`, label: "Modules Library", icon: "🧩" },
  { href: `/a/${slug}/instructor/journeys`, label: "Learning Journeys", icon: "🚇" },
  { href: `/a/${slug}/instructor/content-agent`, label: "Content agent", icon: "🤖" },
  { href: `/a/${slug}/instructor/learners`, label: "Learners", icon: "👥" },
];

// The learner menu is worded in the academy's language.
export const LEARNER_NAV = (slug: string, language?: string | null): NavItem[] => {
  const t = getT(language);
  return [
    { href: `/a/${slug}/learner`, label: t("nav_my_learning"), icon: "📊" },
    { href: `/a/${slug}/learner/catalog`, label: t("nav_catalog"), icon: "🗂️" },
    { href: `/a/${slug}/learner/certificates`, label: t("nav_certificates"), icon: "🎓" },
  ];
};

// Addresses go through saHref() because the portal may be served from a secret path (see lib/superAdminPath.ts).
export const SUPER_ADMIN_NAV = (): NavItem[] =>
  [
    { href: `/super-admin`, label: "Dashboard", icon: "📊" },
    { href: `/super-admin/academies`, label: "Academies", icon: "🏫" },
    { href: `/super-admin/plans`, label: "Subscription Plans", icon: "💳" },
    { href: `/super-admin/home-editor`, label: "Home page", icon: "🖼️" },
    { href: `/super-admin/payouts`, label: "Payouts", icon: "🏦" },
    { href: `/super-admin/health`, label: "System check", icon: "🩺" },
    { href: `/super-admin/settings`, label: "Platform Settings", icon: "⚙️" },
  ].map((n) => ({ ...n, href: saHref(n.href) }));
