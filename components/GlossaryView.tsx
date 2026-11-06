"use client";

import { useState } from "react";
import type { GlossaryTerm } from "@/lib/activities";

export default function GlossaryView({ terms }: { terms: GlossaryTerm[] }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = needle ? terms.filter((t) => t.term.toLowerCase().includes(needle) || t.definition.toLowerCase().includes(needle)) : terms;
  return (
    <div className="grid gap-4">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search terms" aria-label="Search glossary" className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900" />
      <dl className="grid gap-3">
        {shown.map((t, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white p-4">
            <dt className="font-semibold text-gray-900">{t.term}</dt>
            <dd className="mt-1 text-sm text-gray-800 whitespace-pre-line">{t.definition}</dd>
          </div>
        ))}
        {shown.length === 0 && <p className="text-sm text-gray-700">No terms match “{q}”.</p>}
      </dl>
    </div>
  );
}
