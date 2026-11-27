import type { Metadata } from "next";
import Link from "next/link";
import TermsContent from "@/components/TermsContent";
import { termsCompany, termsSections, TERMS_VERSION } from "@/lib/terms";

export const metadata: Metadata = {
  title: "Terms & Conditions | SkillsAcademy.ai",
  description: "The terms for creating and running an academy on SkillsAcademy.ai.",
};

export default function TermsPage() {
  const company = termsCompany();
  return (
    <section style={{ paddingTop: 140, minHeight: "100vh" }}>
      <div className="section-tag">Legal</div>
      <h1 className="section-title">Terms &amp; Conditions</h1>
      <p className="section-sub" style={{ marginBottom: 28 }}>
        For organisations creating an academy on SkillsAcademy.ai. Version {TERMS_VERSION}, effective {company.effectiveDate}.
      </p>
      {!company.complete && (
        <p data-testid="terms-draft-notice" style={{ maxWidth: 860, border: "1px solid #fbcb07", color: "#fbcb07", padding: "12px 16px", fontSize: 13.5, marginBottom: 28 }}>
          Draft: the company details in square brackets below are still to be completed.
        </p>
      )}
      <div className="solution-box" style={{ maxWidth: 860 }} data-testid="terms-page">
        <TermsContent sections={termsSections(company)} />
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 8 }}>
          <Link href="/signup" style={{ color: "var(--gold)" }}>Create your academy</Link>
          {" · "}
          <Link href="/privacy" style={{ color: "var(--gold)" }}>Privacy notice</Link>
        </p>
      </div>
    </section>
  );
}
