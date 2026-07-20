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
            <a href="/#solution">Platform</a>
          </li>
          <li>
            <a href="/#segments">Who It&apos;s For</a>
          </li>
          <li>
            <a href="/#pricing">Pricing</a>
          </li>
          <li>
            <a href="/#how">How It Works</a>
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
          <a href="/signup">Create an Academy</a>
          <a href="/login">Academy Login</a>
          <a href="/super-admin/login">Platform Admin</a>
        </div>
      </footer>
    </div>
  );
}
