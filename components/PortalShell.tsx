import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { logout } from "@/lib/actions/auth";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

export default function PortalShell({
  brandName,
  brandTag,
  themeStyle,
  navItems,
  activeHref,
  userName,
  userRoleLabel,
  logoutRedirect,
  trialBanner,
  children,
}: {
  brandName: string;
  brandTag: string;
  themeStyle?: CSSProperties;
  navItems: NavItem[];
  activeHref: string;
  userName: string;
  userRoleLabel: string;
  logoutRedirect: string;
  trialBanner?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="app-shell flex" style={themeStyle}>
      <aside className="app-sidebar w-64 shrink-0 min-h-screen flex flex-col text-white">
        <div className="px-6 py-6 border-b border-white/10">
          <div className="font-bold text-lg leading-tight">{brandName}</div>
          <div className="text-xs opacity-60 mt-0.5">{brandTag}</div>
        </div>
        <nav className="flex-1 py-4">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-6 py-2.5 text-sm opacity-90 hover:bg-white/5 border-l-3 border-transparent ${
                activeHref === item.href ? "active" : ""
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="px-6 py-5 border-t border-white/10">
          <div className="text-sm font-medium">{userName}</div>
          <div className="text-xs opacity-60 mb-3">{userRoleLabel}</div>
          <form action={logout}>
            <input type="hidden" name="redirectTo" value={logoutRedirect} />
            <button
              type="submit"
              className="text-xs font-semibold px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 transition"
            >
              Log Out
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 min-h-screen">
        {trialBanner}
        <div className="p-8 max-w-6xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
