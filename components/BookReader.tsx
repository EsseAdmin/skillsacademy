"use client";

import { useState } from "react";
import Markup from "@/components/Markup";
import type { Chapter } from "@/lib/activities";

export default function BookReader({ chapters }: { chapters: Chapter[] }) {
  const [i, setI] = useState(0);
  const c = chapters[i];
  if (!c) return <p className="text-sm text-gray-700">This book has no chapters yet.</p>;
  return (
    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
      <nav aria-label="Chapters" className="rounded-lg border border-gray-200 bg-white p-2 text-sm">
        {chapters.map((ch, idx) => (
          <button key={idx} type="button" onClick={() => setI(idx)} aria-current={idx === i ? "true" : undefined}
            className={`block w-full rounded-md px-3 py-2 text-left ${idx === i ? "bg-gray-100 font-semibold text-gray-900" : "text-gray-700 hover:bg-gray-50"}`}>
            {idx + 1}. {ch.title}
          </button>
        ))}
      </nav>
      <article className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-xl font-bold text-gray-900">{c.title}</h2>
        <Markup text={c.text} />
        <div className="mt-6 flex justify-between">
          <button type="button" disabled={i === 0} onClick={() => setI(i - 1)} className="rounded-md border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-800 disabled:opacity-40">← Previous</button>
          <button type="button" disabled={i === chapters.length - 1} onClick={() => setI(i + 1)} className="rounded-md border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-800 disabled:opacity-40">Next →</button>
        </div>
      </article>
    </div>
  );
}
