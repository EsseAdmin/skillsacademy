// Draws a journey as a metro map. Pure geometry (no React, no database) so it
// can be unit-tested and used by both the public map and the builder preview.
//
// Rules of the map:
//  - every pathway (line) runs left to right through its stops, in order;
//  - a station's column is the longest chain of stops leading to it on any line,
//    so a station shared by two lines (an interchange) sits where both can reach it;
//  - every line has its own horizontal lane; an interchange sits on the lane of the
//    first line that serves it, and the other lines bend into it at 45 degrees;
//  - lines that run side by side over the same stretch are drawn as parallel tracks.
import type { JourneyLine } from "./journeyTypes";

// Labels are set at 45 degrees. The top lane's labels rise above the map and every other lane's labels
// hang below it, so a label never runs through the line of the lane above or below its own.
export const MAP = { colW: 165, laneH: 84, left: 56, labelRoom: 130, quiet: 36, rightPad: 150, track: 7 } as const;

export interface PlacedStation {
  id: string;
  x: number;
  y: number;
  col: number;
  lane: number;
  lineIds: string[];
  interchange: boolean;
  /** true: label rises above the station; false: it hangs below. */
  labelUp: boolean;
}
export interface PlacedPath {
  lineId: string;
  color: string;
  d: string;
}
export interface MapLayout {
  width: number;
  height: number;
  stations: PlacedStation[];
  paths: PlacedPath[];
}

export function layoutJourney(lines: JourneyLine[], stops: Record<string, string[]>, stationIds: string[]): MapLayout {
  const known = new Set(stationIds);
  const runs = lines.map((l) => ({ line: l, ids: (stops[l.id] ?? []).filter((id) => known.has(id)) }));
  const used = new Set<string>();
  for (const r of runs) for (const id of r.ids) used.add(id);

  // Columns: relax "each stop is at least one column after the one before it".
  const col = new Map<string, number>();
  for (const id of used) col.set(id, 0);
  const cap = used.size;
  for (let pass = 0; pass <= used.size + 1; pass++) {
    let changed = false;
    for (const r of runs) {
      for (let i = 1; i < r.ids.length; i++) {
        const want = Math.min(cap, col.get(r.ids[i - 1])! + 1);
        if (col.get(r.ids[i])! < want) {
          col.set(r.ids[i], want);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  // Lanes: a station takes the lane of the first line that serves it.
  const laneOfLine = new Map(lines.map((l, i) => [l.id, i]));
  const placed = new Map<string, PlacedStation>();
  let maxCol = 0;
  for (const r of runs) {
    for (const id of r.ids) {
      const existing = placed.get(id);
      if (existing) {
        existing.lineIds.push(r.line.id);
        existing.interchange = true;
        continue;
      }
      const c = col.get(id)!;
      const lane = laneOfLine.get(r.line.id)!;
      maxCol = Math.max(maxCol, c);
      placed.set(id, { id, col: c, lane, x: MAP.left + c * MAP.colW, y: 0, lineIds: [r.line.id], interchange: false, labelUp: true });
    }
  }
  // Vertical placement: lanes counted from the first lane that actually has a station.
  const firstLane = placed.size ? Math.min(...Array.from(placed.values()).map((s) => s.lane)) : 0;
  const hasLower = Array.from(placed.values()).some((s) => s.lane > firstLane);
  const top = MAP.labelRoom;
  for (const s of placed.values()) {
    s.y = top + (s.lane - firstLane) * MAP.laneH;
    s.labelUp = s.lane === firstLane;
  }

  // Parallel tracks where several lines share a segment.
  const segKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const sharing = new Map<string, string[]>();
  for (const r of runs) {
    for (let i = 1; i < r.ids.length; i++) {
      const k = segKey(r.ids[i - 1], r.ids[i]);
      sharing.set(k, [...(sharing.get(k) ?? []), r.line.id]);
    }
  }

  const paths: PlacedPath[] = [];
  for (const r of runs) {
    if (r.ids.length < 2) continue;
    let d = "";
    for (let i = 0; i < r.ids.length; i++) {
      const s = placed.get(r.ids[i])!;
      if (i === 0) {
        d = `M ${s.x} ${s.y}`;
        continue;
      }
      const p = placed.get(r.ids[i - 1])!;
      const group = sharing.get(segKey(p.id, s.id)) ?? [r.line.id];
      const off = (group.indexOf(r.line.id) - (group.length - 1) / 2) * MAP.track;
      const y0 = p.y + off;
      const y1 = s.y + off;
      const dy = Math.abs(y1 - y0);
      if (i === 1) d = `M ${p.x} ${y0}`;
      else d += ` L ${p.x} ${y0}`;
      if (dy < 0.5) d += ` L ${s.x} ${y1}`;
      else if (s.x - p.x > dy) d += ` L ${s.x - dy} ${y0} L ${s.x} ${y1}`;
      else d += ` L ${s.x} ${y1}`;
    }
    paths.push({ lineId: r.line.id, color: r.line.color, d });
  }

  const lastLane = placed.size ? Math.max(...Array.from(placed.values()).map((s) => s.lane)) : 0;
  return {
    width: MAP.left + maxCol * MAP.colW + MAP.rightPad,
    height: top + (lastLane - firstLane) * MAP.laneH + (hasLower ? MAP.labelRoom : MAP.quiet),
    stations: Array.from(placed.values()),
    paths,
  };
}
