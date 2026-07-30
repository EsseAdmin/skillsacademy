import type { NavItem } from "@/components/PortalShell";

export const ADMIN_NAV = (slug: string): NavItem[] => [
  { href: `/a/${slug}/admin`, label: "Dashboard", icon: "📊" },
  { href: `/a/${slug}/admin/courses`, label: "Courses", icon: "📚" },
  { href: `/a/${slug}/admin/people`, label: "People", icon: "👥" },
  { href: `/a/${slug}/admin/branding`, label: "Branding", icon: "🎨" },
  { href: `/a/${slug}/admin/site`, label: "Academy Site", icon: "🌐" },
  { href: `/a/${slug}/admin/marketing`, label: "SEO & Marketing", icon: "📣" },
  { href: `/a/${slug}/admin/billing`, label: "Billing", icon: "💳" },
  { href: `/a/${slug}/admin/settings`, label: "Settings", icon: "⚙️" },
];

export const INSTRUCTOR_NAV = (slug: string): NavItem[] => [
  { href: `/a/${slug}/instructor`, label: "Dashboard", icon: "📊" },
  { href: `/a/${slug}/instructor/courses`, label: "My Courses", icon: "📚" },
  { href: `/a/${slug}/instructor/modules`, label: "Modules Library", icon: "🧩" },
  { href: `/a/${slug}/instructor/learners`, label: "Learners", icon: "👥" },
];

export const LEARNER_NAV = (slug: string): NavItem[] => [
  { href: `/a/${slug}/learner`, label: "My Learning", icon: "📊" },
  { href: `/a/${slug}/learner/catalog`, label: "Course Catalog", icon: "🗂️" },
  { href: `/a/${slug}/learner/certificates`, label: "My Certificates", icon: "🎓" },
];

export const SUPER_ADMIN_NAV: NavItem[] = [
  { href: `/super-admin`, label: "Dashboard", icon: "📊" },
  { href: `/super-admin/academies`, label: "Academies", icon: "🏫" },
  { href: `/super-admin/plans`, label: "Subscription Plans", icon: "💳" },
  { href: `/super-admin/settings`, label: "Platform Settings", icon: "⚙️" },
];
