// Shared (client + server) types and validation for learning journeys: the
// "metro map" of pathways an academy can show on its home page. Nothing here
// touches the database, so the builder (a client component) can use it too.

export type StationKind = "COURSE" | "MODULE" | "ACTIVITY";

export interface JourneyLine {
  id: string;
  name: string;
  color: string;
}

export interface JourneyStation {
  id: string;
  kind: StationKind;
  courseId: string | null;
  moduleId: string | null;
  title: string;
  description: string;
  url: string | null;
}

/** A whole journey as the builder edits and saves it. stops: line id -> ordered station ids. */
export interface JourneyDoc {
  title: string;
  description: string;
  published: boolean;
  lines: JourneyLine[];
  stations: JourneyStation[];
  stops: Record<string, string[]>;
}

/** A station as the public map shows it: with the link a learner can follow (if any). */
export interface JourneyViewStation extends JourneyStation {
  href: string | null;
  hrefKind: "course" | "link" | null;
}

export interface JourneyView {
  id: string;
  title: string;
  description: string;
  lines: JourneyLine[];
  stations: JourneyViewStation[];
  stops: Record<string, string[]>;
}

export const JOURNEY_LIMITS = {
  title: 80,
  description: 400,
  lineName: 40,
  stationTitle: 60,
  stationDescription: 400,
  url: 500,
  lines: 8,
  stations: 40,
  stopsPerLine: 30,
} as const;

// Colours picked for a map: distinct from each other and readable on white.
export const JOURNEY_PALETTE = ["#d6336c", "#1971c2", "#2f9e44", "#f08c00", "#7048e8", "#0c8599", "#e03131", "#5c940d"] as const;

const HEX = /^#[0-9a-fA-F]{6}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

function text(v: unknown, max: number): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}
function longText(v: unknown, max: number): string {
  return String(v ?? "").replace(/\r\n?/g, "\n").trim().slice(0, max);
}

/** Only plain web links are ever stored or shown. */
export function safeHttpUrl(v: unknown): string | null {
  const raw = String(v ?? "").trim();
  if (!raw || raw.length > JOURNEY_LIMITS.url) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export type SanitizeResult = { doc: JourneyDoc; error?: undefined } | { doc?: undefined; error: string };

/**
 * Turns whatever the browser sent into a clean JourneyDoc. Everything is
 * untrusted: ids are re-checked, text is clamped, colours must be hex, links
 * must be http(s), stops can only point at lines/stations that exist.
 * Whether a course or module id really belongs to the academy is checked by the
 * caller (it needs the database).
 */
export function sanitizeJourneyDoc(raw: unknown): SanitizeResult {
  if (!raw || typeof raw !== "object") return { error: "That journey couldn't be read — please try saving again." };
  const r = raw as Record<string, unknown>;
  const title = text(r.title, JOURNEY_LIMITS.title);
  if (!title) return { error: "Give the journey a title." };

  const lines: JourneyLine[] = [];
  const lineIds = new Set<string>();
  for (const l of Array.isArray(r.lines) ? r.lines : []) {
    if (lines.length >= JOURNEY_LIMITS.lines) break;
    const o = (l ?? {}) as Record<string, unknown>;
    const id = String(o.id ?? "");
    if (!ID.test(id) || lineIds.has(id)) continue;
    const name = text(o.name, JOURNEY_LIMITS.lineName);
    if (!name) return { error: "Every pathway needs a name." };
    const color = HEX.test(String(o.color ?? "")) ? String(o.color).toLowerCase() : JOURNEY_PALETTE[lines.length % JOURNEY_PALETTE.length];
    lineIds.add(id);
    lines.push({ id, name, color });
  }

  const stations: JourneyStation[] = [];
  const stationIds = new Set<string>();
  for (const s of Array.isArray(r.stations) ? r.stations : []) {
    if (stations.length >= JOURNEY_LIMITS.stations) break;
    const o = (s ?? {}) as Record<string, unknown>;
    const id = String(o.id ?? "");
    if (!ID.test(id) || stationIds.has(id)) continue;
    const kind: StationKind = o.kind === "COURSE" || o.kind === "MODULE" ? o.kind : "ACTIVITY";
    const courseId = kind === "COURSE" && ID.test(String(o.courseId ?? "")) ? String(o.courseId) : null;
    const moduleId = kind === "MODULE" && ID.test(String(o.moduleId ?? "")) ? String(o.moduleId) : null;
    if (kind === "COURSE" && !courseId) return { error: "Choose a course for each course station." };
    if (kind === "MODULE" && !moduleId) return { error: "Choose a module for each module station." };
    const title = text(o.title, JOURNEY_LIMITS.stationTitle);
    if (!title) return { error: "Every station needs a title." };
    const url = kind === "ACTIVITY" ? safeHttpUrl(o.url) : null;
    if (kind === "ACTIVITY" && String(o.url ?? "").trim() && !url) return { error: `The link for "${title}" must start with http:// or https://.` };
    stationIds.add(id);
    stations.push({ id, kind, courseId, moduleId, title, description: longText(o.description, JOURNEY_LIMITS.stationDescription), url });
  }

  const stops: Record<string, string[]> = {};
  const rawStops = (r.stops && typeof r.stops === "object" ? r.stops : {}) as Record<string, unknown>;
  for (const line of lines) {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const sid of Array.isArray(rawStops[line.id]) ? (rawStops[line.id] as unknown[]) : []) {
      const id = String(sid ?? "");
      if (!stationIds.has(id) || seen.has(id) || list.length >= JOURNEY_LIMITS.stopsPerLine) continue;
      seen.add(id);
      list.push(id);
    }
    stops[line.id] = list;
  }

  return { doc: { title, description: longText(r.description, JOURNEY_LIMITS.description), published: r.published === true, lines, stations, stops } };
}
