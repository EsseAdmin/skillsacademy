// A small single-series bar chart drawn as inline SVG (no chart library, nothing loaded in the browser).
// One measure per chart: two measures of different size get two charts side by side, never two axes.
// Every bar has a hover tooltip (<title>) and the numbers are also available as a table below.
import type { ReactNode } from "react";

export interface BarPoint {
  label: string; // e.g. "12 Oct"
  value: number;
}

export default function BarChart({ title, points, empty, testId }: { title: string; points: BarPoint[]; empty?: ReactNode; testId?: string }) {
  const total = points.reduce((s, p) => s + p.value, 0);
  const max = Math.max(1, ...points.map((p) => p.value));
  const W = 640;
  const H = 160;
  const padL = 30;
  const padB = 22;
  const innerW = W - padL - 6;
  const innerH = H - padB - 10;
  const slot = innerW / Math.max(1, points.length);
  const bar = Math.max(2, Math.min(28, slot - 2));
  const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
  const labelEvery = Math.max(1, Math.ceil(points.length / 7));
  return (
    <figure className="app-card p-5" data-testid={testId}>
      <figcaption className="flex items-baseline justify-between mb-3">
        <span className="font-semibold text-gray-900 text-sm">{title}</span>
        <span className="text-xs text-gray-500">{total.toLocaleString("en-GB")} in total</span>
      </figcaption>
      {total === 0 ? (
        <div className="text-sm text-gray-500 py-10 text-center">{empty ?? "Nothing in this period yet."}</div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${total} in total`} className="w-full h-auto">
          {ticks.map((t) => {
            const y = 6 + innerH - (t / max) * innerH;
            return (
              <g key={t}>
                <line x1={padL} x2={W - 6} y1={y} y2={y} stroke="#e5e7eb" strokeWidth={1} />
                <text x={padL - 5} y={y + 3} textAnchor="end" fontSize={10} fill="#6b7280">
                  {t}
                </text>
              </g>
            );
          })}
          {points.map((p, i) => {
            const h = (p.value / max) * innerH;
            const x = padL + i * slot + (slot - bar) / 2;
            const y = 6 + innerH - h;
            return (
              <g key={`${p.label}-${i}`}>
                <title>{`${p.label}: ${p.value}`}</title>
                {/* wide invisible hit area so thin bars are easy to hover */}
                <rect x={padL + i * slot} y={6} width={slot} height={innerH} fill="transparent" />
                {p.value > 0 && <rect x={x} y={y} width={bar} height={Math.max(2, h)} rx={Math.min(4, bar / 2)} fill="var(--brand-primary)" />}
                {i % labelEvery === 0 && (
                  <text x={x + bar / 2} y={H - 6} textAnchor="middle" fontSize={10} fill="#6b7280">
                    {p.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      <details className="mt-2 text-xs text-gray-500">
        <summary className="cursor-pointer select-none">View as a table</summary>
        <div className="max-h-48 overflow-auto mt-2">
          <table className="w-full text-left">
            <tbody>
              {points.map((p, i) => (
                <tr key={`${p.label}-${i}`} className="border-t border-gray-100">
                  <td className="py-0.5 pr-4">{p.label}</td>
                  <td className="py-0.5">{p.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
