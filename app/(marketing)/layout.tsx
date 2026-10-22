import "./marketing.css";
import Link from "next/link";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="marketing">
      <nav>
        <Link href="/" className="nav-logo">
          Skills<span>Academy</span>.ai
        </Link>
        <ul className="nav-links">
          <li>
            <Link href="/#solution">Platform</Link>
          </li>
          <li>
            <Link href="/#segments">Who It&apos;s For</Link>
          </li>
          <li>
            <Link href="/#pricing">Pricing</Link>
          </li>
          <li>
            <Link href="/#how">How It Works</Link>
          </li>
        </ul>
        <div style={{ display: "flex", alignItems: "center" }}>
          <Link href="/super-admin/login" className="nav-outline" style={{ display: "none" }}>
            Platform Admin
          </Link>
          <Link href="/login" className="nav-outline">
            Log In
          </Link>
          <Link href="/signup" className="nav-cta">
            Create Your Academy
          </Link>
        </div>
      </nav>
      {children}
      <footer>
        <div className="footer-logo">
          Skills<span>Academy</span>.ai
        </div>
        <p>© {new Date().getFullYear()} SkillsAcademy.ai — Academy-as-a-Service for business, charity &amp; public sector.</p>
        <div style={{ display: "flex", gap: 20 }}>
          <Link href="/signup">Create an Academy</Link>
          <Link href="/login">Academy Login</Link>
          <Link href="/super-admin/login">Platform Admin</Link>
        </div>
      </footer>
    </div>
  );
}
