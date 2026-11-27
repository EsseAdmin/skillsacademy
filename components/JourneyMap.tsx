"use client";

import { useMemo, useState } from "react";
import { layoutJourney } from "@/lib/journeyLayout";
import type { JourneyLine, JourneyViewStation } from "@/lib/journeyTypes";

export interface JourneyMapLabels {
  pathways: string;
  onPathways: string;
  viewCourse: string;
  openLink: string;
  mapLabel: string;
  selectHint: string;
  close: string;
}

const MAX_LABEL = 24;
const short = (s: string) => (s.length > MAX_LABEL ? s.slice(0, MAX_LABEL - 1).trimEnd() + "…" : s);

/**
 * A learning journey drawn as a metro map: each pathway is a coloured line, each
 * station a course, module or activity, and a station shared by several pathways
 * is an interchange. Selecting a station (click, tap or keyboard) shows its details
 * underneath; selecting a pathway in the key highlights that line.
 */
export default function JourneyMap({
  title,
  lines,
  stations,
  stops,
  labels,
  initialStationId,
}: {
  title: string;
  lines: JourneyLine[];
  stations: JourneyViewStation[];
  stops: Record<string, string[]>;
  labels: JourneyMapLabels;
  initialStationId?: string;
}) {
  const layout = useMemo(() => layoutJourney(lines, stops, stations.map((s) => s.id)), [lines, stops, stations]);
  const byId = useMemo(() => new Map(stations.map((s) => [s.id, s])), [stations]);
  const lineById = useMemo(() => new Map(lines.map((l) => [l.id, l])), [lines]);
  const [selectedId, setSelectedId] = useState<string | null>(initialStationId ?? null);
  const [focusLine, setFocusLine] = useState<string | null>(null);
  const [kbFocusId, setKbFocusId] = useState<string | null>(null);

  const selected = selectedId ? byId.get(selectedId) : undefined;
  const selectedPlaced = selectedId ? layout.stations.find((p) => p.id === selectedId) : undefined;
  const usedLines = lines.filter((l) => layout.paths.some((p) => p.lineId === l.id) || layout.stations.some((s) => s.lineIds.includes(l.id)));

  return (
    <div data-testid="journey-map">
      {usedLines.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3" role="group" aria-label={labels.pathways}>
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 mr-1">{labels.pathways}</span>
          {usedLines.map((l) => {
            const on = focusLine === l.id;
            return (
              <button
                key={l.id}
                type="button"
                aria-pressed={on}
                onClick={() => setFocusLine(on ? null : l.id)}
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium bg-white"
                style={{ borderColor: l.color, boxShadow: on ? `0 0 0 2px ${l.color}` : undefined }}
                data-testid="journey-line-chip"
              >
                <span aria-hidden="true" className="inline-block w-4 h-1.5 rounded-full" style={{ background: l.color }} />
                {l.name}
              </button>
            );
          })}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <svg
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          role="group"
          aria-label={`${labels.mapLabel}: ${title}`}
          style={{ display: "block", minWidth: layout.width }}
        >
          {layout.paths.map((p) => (
            <path
              key={p.lineId}
              d={p.d}
              fill="none"
              stroke={p.color}
              strokeWidth={7}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={focusLine && focusLine !== p.lineId ? 0.15 : 1}
            />
          ))}
          {layout.stations.map((p) => {
            const st = byId.get(p.id)!;
            const first = lineById.get(p.lineIds[0]);
            const dim = focusLine ? !p.lineIds.includes(focusLine) : false;
            const isSel = selectedId === p.id;
            return (
              <g
                key={p.id}
                role="button"
                tabIndex={0}
                aria-label={st.title}
                aria-pressed={isSel}
                opacity={dim ? 0.25 : 1}
                style={{ cursor: "pointer", outline: "none" }}
                onClick={() => setSelectedId(isSel ? null : p.id)}
                onFocus={() => setKbFocusId(p.id)}
                onBlur={() => setKbFocusId((cur) => (cur === p.id ? null : cur))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedId(isSel ? null : p.id);
                  }
                }}
                data-testid="journey-station"
                data-station={st.title}
              >
                {/* A generous invisible target so stations are easy to hit with a finger. */}
                <circle cx={p.x} cy={p.y} r={22} fill="transparent" />
                {(isSel || kbFocusId === p.id) && <circle cx={p.x} cy={p.y} r={p.interchange ? 19 : 16} fill="none" stroke="#111827" strokeWidth={2} strokeDasharray="3 3" />}
                <circle cx={p.x} cy={p.y} r={p.interchange ? 11 : 8.5} fill="#fff" stroke={p.interchange ? "#111827" : first?.color ?? "#111827"} strokeWidth={p.interchange ? 4.5 : 4} />
                <g transform={p.labelUp ? `translate(${p.x + 6},${p.y - 16}) rotate(-45)` : `translate(${p.x + 2},${p.y + 14}) rotate(45)`}>
                  {/* Transparent backing so the whole label is a click target, not only its letters. */}
                  <rect x={-4} y={-14} width={short(st.title).length * 7.4 + 8} height={22} fill="transparent" />
                  <text fontSize={13} fontWeight={600} fill="#111827">
                    {short(st.title)}
                  </text>
                </g>
                <title>{st.title}</title>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-3 min-h-[3rem]" aria-live="polite" data-testid="journey-detail">
        {selected ? (
          <div className="app-card p-5 relative">
            <button type="button" onClick={() => setSelectedId(null)} className="absolute top-3 right-3 text-xs text-gray-500 hover:text-gray-900" aria-label={labels.close}>
              ✕
            </button>
            <div className="font-semibold text-gray-900 text-lg pr-8">{selected.title}</div>
            {selected.description && <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">{selected.description}</p>}
            {selectedPlaced && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span>{labels.onPathways}</span>
                {selectedPlaced.lineIds.map((id) => {
                  const l = lineById.get(id)!;
                  return (
                    <span key={id} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-white font-medium" style={{ background: l.color }}>
                      {l.name}
                    </span>
                  );
                })}
              </div>
            )}
            {selected.href && (
              <a
                href={selected.href}
                {...(selected.hrefKind === "link" ? { target: "_blank", rel: "noreferrer noopener" } : {})}
                className="inline-block mt-4 text-sm font-semibold app-link"
                data-testid="journey-station-link"
              >
                {selected.hrefKind === "course" ? labels.viewCourse : labels.openLink} {selected.hrefKind === "link" ? "↗" : "→"}
              </a>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">{labels.selectHint}</p>
        )}
      </div>
    </div>
  );
}
