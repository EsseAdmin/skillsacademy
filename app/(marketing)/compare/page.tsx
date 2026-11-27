import type { Metadata } from "next";
import Link from "next/link";
import { COMPARISONS, CHECKED_ON } from "@/lib/comparisons";

export const metadata: Metadata = {
  title: "SkillsAcademy.ai compared with other platforms",
  description: "A fair, checkable comparison of SkillsAcademy.ai with Thinkific, Teachable, Kajabi and TalentLMS: what each does well and who each is for.",
};

export default function CompareIndexPage() {
  return (
    <section style={{ paddingTop: 140, minHeight: "100vh" }}>
      <div className="section-tag">Compare</div>
      <h1 className="section-title">How SkillsAcademy.ai compares</h1>
      <p className="section-sub" style={{ marginBottom: 28 }}>
        Every platform is good at something different. These pages say what each one does well, where we are the better fit, and where we are not. Checked {CHECKED_ON}.
      </p>
      <div style={{ display: "grid", gap: 16, maxWidth: 860 }} data-testid="compare-index">
        {COMPARISONS.map((c) => (
          <Link key={c.slug} href={`/compare/${c.slug}`} className="solution-box" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
            <h3 style={{ margin: "0 0 6px", color: "#fff" }}>SkillsAcademy.ai vs {c.name}</h3>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.7)", fontSize: 14 }}>{c.tagline}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
