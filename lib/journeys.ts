// Learning journeys: storage and the public view. The shapes and validation
// shared with the builder live in lib/journeyTypes.ts.
import { queryAll, queryOne, exec, newId, nowIso, withTransaction } from "./db";
import type { JourneyDoc, JourneyLine, JourneyStation, JourneyView, JourneyViewStation, StationKind } from "./journeyTypes";

export interface JourneyRow {
  id: string;
  academy_id: string;
  created_by: string | null;
  title: string;
  description: string;
  is_published: number;
  order_index: number;
  created_at: string;
  updated_at: string;
}

interface LineRow { id: string; journey_id: string; name: string; color: string; order_index: number }
interface StationRow {
  id: string;
  journey_id: string;
  kind: string;
  course_id: string | null;
  module_id: string | null;
  title: string;
  description: string;
  link_url: string | null;
  order_index: number;
}
interface StopRow { line_id: string; station_id: string; position: number }

export interface JourneySummary extends JourneyRow {
  line_count: number;
  station_count: number;
  creator_name: string | null;
}

async function loadParts(journeyIds: string[]) {
  if (journeyIds.length === 0) return { lines: [] as LineRow[], stations: [] as StationRow[], stops: [] as StopRow[] };
  const lines = await queryAll<LineRow>("SELECT * FROM journey_lines WHERE journey_id = ANY($1) ORDER BY order_index", [journeyIds]);
  const stations = await queryAll<StationRow>("SELECT * FROM journey_stations WHERE journey_id = ANY($1) ORDER BY order_index", [journeyIds]);
  const stops = await queryAll<StopRow>(
    "SELECT s.* FROM journey_stops s JOIN journey_lines l ON l.id = s.line_id WHERE l.journey_id = ANY($1) ORDER BY s.position",
    [journeyIds]
  );
  return { lines, stations, stops };
}

function toKind(k: string): StationKind {
  return k === "COURSE" || k === "MODULE" ? k : "ACTIVITY";
}

function assemble(row: JourneyRow, parts: Awaited<ReturnType<typeof loadParts>>): JourneyDoc & { id: string } {
  const lines: JourneyLine[] = parts.lines.filter((l) => l.journey_id === row.id).map((l) => ({ id: l.id, name: l.name, color: l.color }));
  const stations: JourneyStation[] = parts.stations
    .filter((s) => s.journey_id === row.id)
    .map((s) => ({
      id: s.id,
      kind: toKind(s.kind),
      courseId: s.course_id,
      moduleId: s.module_id,
      title: s.title,
      description: s.description,
      url: s.link_url,
    }));
  const stops: Record<string, string[]> = Object.fromEntries(lines.map((l) => [l.id, [] as string[]]));
  for (const st of parts.stops) if (stops[st.line_id]) stops[st.line_id].push(st.station_id);
  return { id: row.id, title: row.title, description: row.description, published: row.is_published === 1, lines, stations, stops };
}

export const Journeys = {
  async byId(id: string): Promise<JourneyRow | undefined> {
    return queryOne<JourneyRow>("SELECT * FROM learning_journeys WHERE id = $1", [id]);
  },

  /** Journeys for the builder's list. Pass createdBy to see only one person's own. */
  async list(academyId: string, createdBy?: string): Promise<JourneySummary[]> {
    return queryAll<JourneySummary>(
      `SELECT j.*,
        (SELECT count(*)::int FROM journey_lines l WHERE l.journey_id = j.id) AS line_count,
        (SELECT count(*)::int FROM journey_stations s WHERE s.journey_id = j.id) AS station_count,
        u.name AS creator_name
       FROM learning_journeys j LEFT JOIN users u ON u.id = j.created_by
       WHERE j.academy_id = $1 ${createdBy ? "AND j.created_by = $2" : ""}
       ORDER BY j.order_index, j.created_at`,
      createdBy ? [academyId, createdBy] : [academyId]
    );
  },

  async create(academyId: string, createdBy: string, title: string): Promise<string> {
    const id = newId();
    const now = nowIso();
    const next = await queryOne<{ n: number }>("SELECT COALESCE(MAX(order_index), -1) + 1 AS n FROM learning_journeys WHERE academy_id = $1", [academyId]);
    await exec(
      "INSERT INTO learning_journeys (id, academy_id, created_by, title, description, is_published, order_index, created_at, updated_at) VALUES ($1,$2,$3,$4,'',0,$5,$6,$6)",
      [id, academyId, createdBy, title, next?.n ?? 0, now]
    );
    return id;
  },

  /** One journey in the builder's shape. */
  async load(id: string): Promise<(JourneyDoc & { id: string; academyId: string; createdBy: string | null }) | undefined> {
    const row = await this.byId(id);
    if (!row) return undefined;
    const parts = await loadParts([id]);
    return { ...assemble(row, parts), academyId: row.academy_id, createdBy: row.created_by };
  },

  /** Replaces a journey's lines, stations and stops with the (already validated) document, all or nothing. */
  async save(id: string, doc: JourneyDoc): Promise<void> {
    await withTransaction(async (run) => {
      await run("UPDATE learning_journeys SET title=$1, description=$2, is_published=$3, updated_at=$4 WHERE id=$5", [
        doc.title,
        doc.description,
        doc.published ? 1 : 0,
        nowIso(),
        id,
      ]);
      // Stops cascade from lines and stations.
      await run("DELETE FROM journey_lines WHERE journey_id = $1", [id]);
      await run("DELETE FROM journey_stations WHERE journey_id = $1", [id]);
      // Fresh ids on every save: nothing outside a journey ever points at a line or station.
      const lineId = new Map<string, string>();
      const stationId = new Map<string, string>();
      for (const [i, l] of doc.lines.entries()) {
        const nid = newId();
        lineId.set(l.id, nid);
        await run("INSERT INTO journey_lines (id, journey_id, name, color, order_index) VALUES ($1,$2,$3,$4,$5)", [nid, id, l.name, l.color, i]);
      }
      for (const [i, s] of doc.stations.entries()) {
        const nid = newId();
        stationId.set(s.id, nid);
        await run(
          "INSERT INTO journey_stations (id, journey_id, kind, course_id, module_id, title, description, link_url, order_index) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
          [nid, id, s.kind, s.courseId, s.moduleId, s.title, s.description, s.url, i]
        );
      }
      for (const l of doc.lines) {
        for (const [pos, sid] of (doc.stops[l.id] ?? []).entries()) {
          await run("INSERT INTO journey_stops (line_id, station_id, position) VALUES ($1,$2,$3)", [lineId.get(l.id), stationId.get(sid), pos]);
        }
      }
    });
  },

  /** Adds a journey to (or takes it off) the academy's public home page. */
  async setPublished(id: string, published: boolean): Promise<void> {
    await exec("UPDATE learning_journeys SET is_published = $1, updated_at = $2 WHERE id = $3", [published ? 1 : 0, nowIso(), id]);
  },

  async remove(id: string): Promise<void> {
    await exec("DELETE FROM learning_journeys WHERE id = $1", [id]);
  },

  /**
   * The published journeys of an academy, ready to draw on its public pages. A
   * course or module station only gets a link when that course is published, so a
   * draft course is never exposed; an unlinked station still shows its title.
   */
  async publishedViews(academyId: string, slug: string): Promise<JourneyView[]> {
    const rows = await queryAll<JourneyRow>("SELECT * FROM learning_journeys WHERE academy_id = $1 AND is_published = 1 ORDER BY order_index, created_at", [academyId]);
    if (rows.length === 0) return [];
    const parts = await loadParts(rows.map((r) => r.id));
    const courseIds = parts.stations.map((s) => s.course_id).filter((x): x is string => !!x);
    const moduleIds = parts.stations.map((s) => s.module_id).filter((x): x is string => !!x);
    const published = new Set(
      (await queryAll<{ id: string }>("SELECT id FROM courses WHERE academy_id = $1 AND is_published = 1 AND id = ANY($2)", [academyId, courseIds])).map((r) => r.id)
    );
    const courseOfModule = new Map(
      (
        await queryAll<{ module_id: string; course_id: string }>(
          `SELECT DISTINCT ON (cm.module_id) cm.module_id, c.id AS course_id
           FROM course_modules cm JOIN courses c ON c.id = cm.course_id
           WHERE c.academy_id = $1 AND c.is_published = 1 AND cm.module_id = ANY($2)
           ORDER BY cm.module_id, cm.order_index`,
          [academyId, moduleIds]
        )
      ).map((r) => [r.module_id, r.course_id])
    );
    const courseHref = (id: string) => `/a/${slug}/courses/${id}`;
    return rows.map((row) => {
      const doc = assemble(row, parts);
      const stations: JourneyViewStation[] = doc.stations.map((s) => {
        let href: string | null = null;
        let hrefKind: JourneyViewStation["hrefKind"] = null;
        if (s.kind === "COURSE" && s.courseId && published.has(s.courseId)) {
          href = courseHref(s.courseId);
          hrefKind = "course";
        } else if (s.kind === "MODULE" && s.moduleId && courseOfModule.has(s.moduleId)) {
          href = courseHref(courseOfModule.get(s.moduleId)!);
          hrefKind = "course";
        } else if (s.kind === "ACTIVITY" && s.url) {
          href = s.url;
          hrefKind = "link";
        }
        return { ...s, href, hrefKind };
      });
      return { id: row.id, title: doc.title, description: doc.description, lines: doc.lines, stations, stops: doc.stops };
    });
  },
};
