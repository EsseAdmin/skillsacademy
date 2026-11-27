import type { Metadata } from "next";
import Link from "next/link";
import { SHIPPED, PLANNED } from "@/lib/roadmap";

export const metadata: Metadata = {
  title: "What's new and coming next | SkillsAcademy.ai",
  description: "What we have recently shipped on SkillsAcademy.ai, and what we are planning next.",
};

export default function RoadmapPage() {
  return (
    <section style={{ paddingTop: 140, minHeight: "100vh" }}>
      <div className="section-tag">Roadmap</div>
      <h1 className="section-title">What&apos;s new and coming next</h1>
      <p className="section-sub" style={{ marginBottom: 28 }}>
        What is live today, and what we are planning. The plans are intentions, not promises: order and timing can change.
      </p>
      <div className="solution-box" style={{ maxWidth: 860, color: "rgba(255,255,255,0.85)" }} data-testid="roadmap-page">
        <h2 style={{ fontSize: 20, color: "#fff", margin: "0 0 14px" }}>Coming next</h2>
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 30px" }} data-testid="roadmap-planned">
          {PLANNED.map((p) => (
            <li key={p.title} style={{ marginBottom: 12 }}>
              <strong style={{ color: "#fff" }}>{p.title}.</strong> {p.detail}
            </li>
          ))}
        </ul>
        <h2 style={{ fontSize: 20, color: "#fff", margin: "0 0 14px" }}>Recently shipped</h2>
        <div data-testid="roadmap-shipped">
          {SHIPPED.map((g) => (
            <div key={g.when} style={{ marginBottom: 22 }}>
              <h3 style={{ fontSize: 15, color: "var(--gold)", margin: "0 0 8px" }}>{g.when}</h3>
              <ul style={{ paddingLeft: 22, margin: 0 }}>
                {g.items.map((i) => (
                  <li key={i.title} style={{ marginBottom: 6 }}>
                    <strong style={{ color: "#fff" }}>{i.title}.</strong> {i.detail}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 8 }}>
          See how we compare with other platforms on the{" "}
          <Link href="/compare" style={{ color: "var(--gold)" }}>comparison pages</Link>, or{" "}
          <Link href="/signup" style={{ color: "var(--gold)" }}>create your academy</Link>.
        </p>
      </div>
    </section>
  );
}
