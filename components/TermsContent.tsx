import type { TermsSection } from "@/lib/terms";

// The Terms & Conditions text. Pure rendering (no hooks) so the public /terms page (server) and the sign-up wizard (client)
// show exactly the same words. The sections come from lib/terms.ts, filled with the company details on the server.
// Each clause is a div, not a <section>: the marketing stylesheet gives every <section> 100px 60px of padding, which left huge gaps between clauses.
export default function TermsContent({ sections }: { sections: TermsSection[] }) {
  return (
    <div style={{ fontSize: 14, lineHeight: 1.65, color: "rgba(255,255,255,0.82)" }}>
      {sections.map((s) => (
        <div key={s.id} id={s.id} style={{ marginBottom: 18, padding: 0 }}>
          <h3 style={{ fontSize: 15.5, fontWeight: 700, color: "#fff", margin: "0 0 8px" }}>{s.title}</h3>
          {s.blocks.map((b, i) =>
            typeof b === "string" ? (
              <p key={i} style={{ margin: "0 0 10px" }}>{b}</p>
            ) : (
              <ul key={i} style={{ margin: "0 0 10px", paddingLeft: 22 }}>
                {b.list.map((item, j) => (
                  <li key={j} style={{ marginBottom: 5 }}>{item}</li>
                ))}
              </ul>
            )
          )}
        </div>
      ))}
    </div>
  );
}
