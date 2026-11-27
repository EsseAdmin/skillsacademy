import type { Metadata } from "next";
import Link from "next/link";
import TermsContent from "@/components/TermsContent";
import { termsCompany } from "@/lib/terms";
import { privacySections, PRIVACY_VERSION } from "@/lib/privacy";

export const metadata: Metadata = {
  title: "Privacy notice | SkillsAcademy.ai",
  description: "How SkillsAcademy.ai collects, uses and protects personal data.",
};

export default function PrivacyPage() {
  const company = termsCompany();
  return (
    <section style={{ paddingTop: 140, minHeight: "100vh" }}>
      <div className="section-tag">Legal</div>
      <h1 className="section-title">Privacy notice</h1>
      <p className="section-sub" style={{ marginBottom: 28 }}>
        How we handle personal data. Version {PRIVACY_VERSION}, effective {company.effectiveDate}.
      </p>
      {!company.complete && (
        <p data-testid="privacy-draft-notice" style={{ maxWidth: 860, border: "1px solid #fbcb07", color: "#fbcb07", padding: "12px 16px", fontSize: 13.5, marginBottom: 28 }}>
          Draft: the company details in square brackets below are still to be completed.
        </p>
      )}
      <div className="solution-box" style={{ maxWidth: 860 }} data-testid="privacy-page">
        <TermsContent sections={privacySections(company)} />
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 8 }}>
          <Link href="/terms" style={{ color: "var(--gold)" }}>Terms &amp; Conditions</Link>
        </p>
      </div>
    </section>
  );
}
