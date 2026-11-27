import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { COMPARISONS, CHECKED_ON, comparisonBySlug } from "@/lib/comparisons";

export function generateStaticParams() {
  return COMPARISONS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const c = comparisonBySlug(slug);
  if (!c) return {};
  return {
    title: `SkillsAcademy.ai vs ${c.name}`,
    description: `How SkillsAcademy.ai compares with ${c.name}: features side by side, where each is stronger, and who each is for.`,
  };
}

const cell = { padding: "10px 12px", verticalAlign: "top" as const, borderBottom: "1px solid rgba(255,255,255,0.12)", fontSize: 13.5, lineHeight: 1.55 };

export default async function ComparePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = comparisonBySlug(slug);
  if (!c) notFound();
  return (
    <section style={{ paddingTop: 140, minHeight: "100vh" }}>
      <div className="section-tag">Compare</div>
      <h1 className="section-title">SkillsAcademy.ai vs {c.name}</h1>
      <p className="section-sub" style={{ marginBottom: 28 }}>{c.intro}</p>
      <div className="solution-box" style={{ maxWidth: 980, color: "rgba(255,255,255,0.85)" }} data-testid="compare-page">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
            <thead>
              <tr>
                <th style={{ ...cell, textAlign: "left", width: "16%" }}></th>
                <th style={{ ...cell, textAlign: "left", width: "42%", color: "#fff" }}>{c.name}</th>
                <th style={{ ...cell, textAlign: "left", width: "42%", color: "var(--gold)" }}>SkillsAcademy.ai</th>
              </tr>
            </thead>
            <tbody>
              {c.rows.map((r) => (
                <tr key={r.topic}>
                  <th scope="row" style={{ ...cell, textAlign: "left", color: "#fff" }}>{r.topic}</th>
                  <td style={cell}>{r.them}</td>
                  <td style={cell}>{r.us}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 style={{ margin: "28px 0 8px", color: "#fff" }}>Where {c.name} is stronger</h3>
        <ul style={{ paddingLeft: 22, margin: 0 }}>
          {c.strongerThem.map((t) => <li key={t} style={{ marginBottom: 6 }}>{t}</li>)}
        </ul>

        <h3 style={{ margin: "24px 0 8px", color: "#fff" }}>Where SkillsAcademy.ai fits better</h3>
        <ul style={{ paddingLeft: 22, margin: 0 }}>
          {c.strongerUs.map((t) => <li key={t} style={{ marginBottom: 6 }}>{t}</li>)}
        </ul>

        <h3 style={{ margin: "24px 0 8px", color: "#fff" }}>Which should you choose?</h3>
        <p style={{ margin: "0 0 8px" }}><strong>Choose {c.name} if</strong> {c.chooseThem}</p>
        <p style={{ margin: 0 }}><strong>Choose SkillsAcademy.ai if</strong> {c.chooseUs}</p>

        <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.55)", marginTop: 26 }} data-testid="compare-note">
          {c.name} information comes from its own website ({c.source}) as read on {CHECKED_ON}. Products and plans change, and some features depend on the plan, so please check {c.name}&apos;s current site before you decide. &quot;Not stated on the page we checked&quot; means we found no statement either way. We are not affiliated with {c.name}.
        </p>
        <p style={{ marginTop: 18 }}>
          <Link href="/signup" className="btn-primary" style={{ display: "inline-block" }}>Create your academy</Link>
          {" "}
          <Link href="/compare" style={{ color: "var(--gold)", marginLeft: 12 }}>All comparisons</Link>
        </p>
      </div>
    </section>
  );
}
