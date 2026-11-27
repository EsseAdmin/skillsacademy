// Engagement analytics for one academy: how learners are using its courses and modules.
// Every query is scoped by academy id, so one academy can never see another's numbers.
//
// "Activity" means any of: starting a course, completing a module, submitting a quiz, working
// through a lesson, handing in an assignment or posting in a forum. A learner is "inactive" when
// they have a course that is not finished and nothing has happened in it for INACTIVE_DAYS.
import { queryAll, queryOne } from "@/lib/db";

export const INACTIVE_DAYS = 14;

export const RANGES = {
  "7d": { label: "Last 7 days", days: 7 },
  "30d": { label: "Last 30 days", days: 30 },
  "90d": { label: "Last 90 days", days: 90 },
  "365d": { label: "Last 12 months", days: 365 },
  all: { label: "All time", days: 0 },
} as const;
export type RangeKey = keyof typeof RANGES;

export function parseRange(raw: string | undefined | null): RangeKey {
  return raw && raw in RANGES ? (raw as RangeKey) : "30d";
}

/** ISO timestamp the range starts at ("" = from the beginning, since every ISO string sorts after it). */
export function rangeFrom(key: RangeKey, now = new Date()): string {
  const days = RANGES[key].days;
  return days === 0 ? "" : new Date(now.getTime() - days * 86_400_000).toISOString();
}

export function inactiveCutoff(now = new Date()): string {
  return new Date(now.getTime() - INACTIVE_DAYS * 86_400_000).toISOString();
}

const COMPLETED = "(e.status = 'completed' OR e.progress_pct >= 100)";

// Last thing that happened in each enrolment (joined as `la`).
const LAST_ACTIVITY = `
  SELECT e.id AS enrollment_id,
         GREATEST(e.enrolled_at, COALESCE(mc.ts, ''), COALESCE(qa.ts, '')) AS last_ts
    FROM enrollments e
    LEFT JOIN (SELECT m.enrollment_id, max(m.completed_at) AS ts
                 FROM module_completions m JOIN enrollments x ON x.id = m.enrollment_id
                WHERE x.academy_id = $1 GROUP BY m.enrollment_id) mc ON mc.enrollment_id = e.id
    LEFT JOIN (SELECT a.enrollment_id, max(a.submitted_at) AS ts
                 FROM quiz_attempts a JOIN enrollments x ON x.id = a.enrollment_id
                WHERE x.academy_id = $1 AND a.submitted_at IS NOT NULL GROUP BY a.enrollment_id) qa ON qa.enrollment_id = e.id
   WHERE e.academy_id = $1`;

// Every learner action in the academy as (learner_id, ts).
const LEARNER_EVENTS = `
  SELECT e.learner_id, m.completed_at AS ts FROM module_completions m JOIN enrollments e ON e.id = m.enrollment_id WHERE e.academy_id = $1
  UNION ALL SELECT a.learner_id, a.submitted_at FROM quiz_attempts a JOIN users u ON u.id = a.learner_id WHERE u.academy_id = $1 AND a.submitted_at IS NOT NULL
  UNION ALL SELECT l.learner_id, l.updated_at FROM lesson_progress l JOIN users u ON u.id = l.learner_id WHERE u.academy_id = $1
  UNION ALL SELECT s.learner_id, s.submitted_at FROM assignment_submissions s JOIN users u ON u.id = s.learner_id WHERE u.academy_id = $1
  UNION ALL SELECT p.author_id, p.created_at FROM forum_posts p JOIN users u ON u.id = p.author_id WHERE u.academy_id = $1 AND u.role = 'LEARNER'
  UNION ALL SELECT learner_id, enrolled_at FROM enrollments WHERE academy_id = $1`;

// ---------------------------------------------------------------- overview

export interface Overview {
  learners: number;
  enrolmentsTotal: number;
  enrolmentsNew: number;
  activeLearners: number;
  moduleCompletions: number;
  certificates: number;
  avgProgress: number;
  quizAttempts: number;
  quizPassRate: number | null;
  courseCompletions: number;
  inactiveLearners: number;
}

export async function overview(academyId: string, from: string, inactiveBefore = inactiveCutoff()): Promise<Overview> {
  const r = await queryOne<Record<string, number | null>>(
    `SELECT
      (SELECT count(*)::int FROM users WHERE academy_id = $1 AND role = 'LEARNER' AND is_active = 1) AS learners,
      (SELECT count(*)::int FROM enrollments WHERE academy_id = $1) AS enrolments_total,
      (SELECT count(*)::int FROM enrollments WHERE academy_id = $1 AND enrolled_at >= $2) AS enrolments_new,
      (SELECT count(DISTINCT learner_id)::int FROM (${LEARNER_EVENTS}) ev WHERE ev.ts >= $2) AS active_learners,
      (SELECT count(*)::int FROM module_completions m JOIN enrollments e ON e.id = m.enrollment_id JOIN modules mm ON mm.id = m.module_id WHERE e.academy_id = $1 AND m.completed_at >= $2 AND mm.parent_module_id IS NULL) AS module_completions,
      (SELECT count(*)::int FROM certificates WHERE academy_id = $1 AND issued_at >= $2) AS certificates,
      (SELECT COALESCE(round(avg(progress_pct)), 0)::int FROM enrollments WHERE academy_id = $1) AS avg_progress,
      (SELECT count(*)::int FROM quiz_attempts a JOIN users u ON u.id = a.learner_id WHERE u.academy_id = $1 AND a.submitted_at >= $2) AS quiz_attempts,
      (SELECT round(100.0 * sum(a.passed) / NULLIF(count(*), 0))::int FROM quiz_attempts a JOIN users u ON u.id = a.learner_id WHERE u.academy_id = $1 AND a.submitted_at >= $2) AS quiz_pass_rate,
      (SELECT count(*)::int FROM enrollments e WHERE e.academy_id = $1 AND ${COMPLETED}) AS course_completions,
      (SELECT count(DISTINCT e.learner_id)::int FROM enrollments e JOIN (${LAST_ACTIVITY}) la ON la.enrollment_id = e.id
         WHERE e.academy_id = $1 AND NOT ${COMPLETED} AND la.last_ts < $3) AS inactive_learners`,
    [academyId, from, inactiveBefore]
  );
  return {
    learners: r?.learners ?? 0,
    enrolmentsTotal: r?.enrolments_total ?? 0,
    enrolmentsNew: r?.enrolments_new ?? 0,
    activeLearners: r?.active_learners ?? 0,
    moduleCompletions: r?.module_completions ?? 0,
    certificates: r?.certificates ?? 0,
    avgProgress: r?.avg_progress ?? 0,
    quizAttempts: r?.quiz_attempts ?? 0,
    quizPassRate: r?.quiz_pass_rate ?? null,
    courseCompletions: r?.course_completions ?? 0,
    inactiveLearners: r?.inactive_learners ?? 0,
  };
}

export interface SeriesPoint {
  bucket: string; // YYYY-MM-DD (the day, or the Monday of the week)
  enrolments: number;
  completions: number;
}

/** Enrolments and module completions over time: daily for up to 90 days, weekly beyond that. */
export async function activitySeries(academyId: string, key: RangeKey, now = new Date()): Promise<{ unit: "day" | "week"; points: SeriesPoint[] }> {
  const days = RANGES[key].days;
  const unit: "day" | "week" = days !== 0 && days <= 90 ? "day" : "week";
  const from = rangeFrom(key, now);
  const rows = await queryAll<{ bucket: string; kind: string; n: number }>(
    `SELECT date_trunc($3::text, (x.ts)::timestamptz AT TIME ZONE 'UTC')::date::text AS bucket, x.kind, count(*)::int AS n
       FROM (
         SELECT m.completed_at AS ts, 'completions' AS kind FROM module_completions m JOIN enrollments e ON e.id = m.enrollment_id JOIN modules mm ON mm.id = m.module_id WHERE e.academy_id = $1 AND m.completed_at >= $2 AND mm.parent_module_id IS NULL
         UNION ALL SELECT enrolled_at, 'enrolments' FROM enrollments WHERE academy_id = $1 AND enrolled_at >= $2
       ) x GROUP BY 1, 2 ORDER BY 1`,
    [academyId, from, unit]
  );
  const map = new Map<string, SeriesPoint>();
  for (const r of rows) {
    const p = map.get(r.bucket) ?? { bucket: r.bucket, enrolments: 0, completions: 0 };
    if (r.kind === "enrolments") p.enrolments = r.n;
    else p.completions = r.n;
    map.set(r.bucket, p);
  }
  // Fill the gaps so a quiet day shows as an empty bar rather than disappearing.
  const dayMs = 86_400_000;
  const end = startOfBucket(now, unit);
  let start = from ? startOfBucket(new Date(from), unit) : rows.length ? new Date(rows[0].bucket + "T00:00:00Z") : end;
  if (unit === "week" && end.getTime() - start.getTime() > 104 * 7 * dayMs) start = new Date(end.getTime() - 104 * 7 * dayMs);
  const points: SeriesPoint[] = [];
  const step = (unit === "day" ? 1 : 7) * dayMs;
  for (let t = start.getTime(); t <= end.getTime(); t += step) {
    const b = new Date(t).toISOString().slice(0, 10);
    points.push(map.get(b) ?? { bucket: b, enrolments: 0, completions: 0 });
  }
  return { unit, points };
}

function startOfBucket(d: Date, unit: "day" | "week"): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  if (unit === "week") x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); // back to Monday
  return x;
}

// ---------------------------------------------------------------- courses

export interface CourseStat {
  id: string;
  title: string;
  cover_emoji: string;
  is_published: number;
  modules: number;
  enrolled: number;
  newEnrolments: number;
  completed: number;
  avgProgress: number;
  stalled: number;
  avgQuizScore: number | null;
}

export async function courseStats(academyId: string, from: string, inactiveBefore = inactiveCutoff()): Promise<CourseStat[]> {
  const rows = await queryAll<{
    id: string; title: string; cover_emoji: string; is_published: number; modules: number; enrolled: number;
    new_enrolments: number; completed: number; avg_progress: number; stalled: number; avg_quiz: number | null;
  }>(
    `SELECT c.id, c.title, c.cover_emoji, c.is_published,
        (SELECT count(*)::int FROM course_modules cm WHERE cm.course_id = c.id) AS modules,
        count(e.id)::int AS enrolled,
        (count(e.id) FILTER (WHERE e.enrolled_at >= $2))::int AS new_enrolments,
        (count(e.id) FILTER (WHERE ${COMPLETED}))::int AS completed,
        COALESCE(round(avg(e.progress_pct)), 0)::int AS avg_progress,
        (count(e.id) FILTER (WHERE NOT ${COMPLETED} AND la.last_ts < $3))::int AS stalled,
        (SELECT round(avg(qa.score_pct))::int FROM quiz_attempts qa JOIN enrollments e2 ON e2.id = qa.enrollment_id
          WHERE e2.course_id = c.id AND qa.submitted_at IS NOT NULL AND qa.submitted_at >= $2) AS avg_quiz
       FROM courses c
       LEFT JOIN enrollments e ON e.course_id = c.id
       LEFT JOIN (${LAST_ACTIVITY}) la ON la.enrollment_id = e.id
      WHERE c.academy_id = $1
      GROUP BY c.id ORDER BY count(e.id) DESC, c.title`,
    [academyId, from, inactiveBefore]
  );
  return rows.map((r) => ({
    id: r.id, title: r.title, cover_emoji: r.cover_emoji, is_published: r.is_published, modules: r.modules, enrolled: r.enrolled,
    newEnrolments: r.new_enrolments, completed: r.completed, avgProgress: r.avg_progress, stalled: r.stalled, avgQuizScore: r.avg_quiz,
  }));
}

export interface ModuleFunnelRow {
  id: string;
  title: string;
  content_type: string;
  position: number;
  reached: number; // learners enrolled in the course
  completed: number;
  attempts: number | null;
  avgScore: number | null;
  passRate: number | null;
}

/** For one course: how many of its learners completed each module, in course order (shows where people drop off). */
export async function courseFunnel(academyId: string, courseId: string): Promise<ModuleFunnelRow[]> {
  const rows = await queryAll<{ id: string; title: string; content_type: string; position: number; reached: number; completed: number }>(
    `SELECT m.id, m.title, m.content_type, cm.order_index AS position,
        (SELECT count(*)::int FROM enrollments e0 WHERE e0.course_id = cm.course_id AND e0.academy_id = $1) AS reached,
        (SELECT count(*)::int FROM module_completions mc JOIN enrollments e ON e.id = mc.enrollment_id
          WHERE mc.module_id = m.id AND e.course_id = cm.course_id AND e.academy_id = $1) AS completed
       FROM course_modules cm JOIN modules m ON m.id = cm.module_id
      WHERE cm.course_id = $2 AND m.academy_id = $1
      ORDER BY cm.order_index`,
    [academyId, courseId]
  );
  const quiz = rows.length
    ? await queryAll<{ module_id: string; attempts: number; avg_score: number | null; pass_rate: number | null }>(
        `SELECT q.module_id, count(qa.id)::int AS attempts, round(avg(qa.score_pct))::int AS avg_score,
                round(100.0 * sum(qa.passed) / NULLIF(count(qa.id), 0))::int AS pass_rate
           FROM quizzes q JOIN quiz_attempts qa ON qa.quiz_id = q.id JOIN enrollments e ON e.id = qa.enrollment_id
          WHERE q.module_id = ANY($1) AND e.course_id = $2 AND e.academy_id = $3 AND qa.submitted_at IS NOT NULL
          GROUP BY q.module_id`,
        [rows.map((r) => r.id), courseId, academyId]
      )
    : [];
  const byModule = new Map(quiz.map((q) => [q.module_id, q]));
  return rows.map((r) => {
    const q = byModule.get(r.id);
    return { ...r, attempts: q?.attempts ?? null, avgScore: q?.avg_score ?? null, passRate: q?.pass_rate ?? null };
  });
}

export interface CourseLearnerRow {
  id: string;
  name: string;
  email: string;
  progress: number;
  status: string;
  enrolledAt: string;
  lastActive: string;
  modulesDone: number;
}

export async function courseLearners(academyId: string, courseId: string, limit = 200): Promise<CourseLearnerRow[]> {
  const rows = await queryAll<{ id: string; name: string; email: string; progress_pct: number; status: string; enrolled_at: string; last_ts: string; done: number }>(
    `SELECT u.id, u.name, u.email, e.progress_pct, e.status, e.enrolled_at, la.last_ts,
            (SELECT count(*)::int FROM module_completions mc JOIN course_modules cmx ON cmx.module_id = mc.module_id AND cmx.course_id = e.course_id WHERE mc.enrollment_id = e.id) AS done
       FROM enrollments e JOIN users u ON u.id = e.learner_id JOIN (${LAST_ACTIVITY}) la ON la.enrollment_id = e.id
      WHERE e.course_id = $2 AND e.academy_id = $1
      ORDER BY la.last_ts DESC LIMIT $3`,
    [academyId, courseId, limit]
  );
  return rows.map((r) => ({ id: r.id, name: r.name, email: r.email, progress: r.progress_pct, status: r.status, enrolledAt: r.enrolled_at, lastActive: r.last_ts, modulesDone: r.done }));
}

// ---------------------------------------------------------------- modules

export type ModuleSort = "attention" | "popular";

export interface ModuleStat {
  id: string;
  title: string;
  content_type: string;
  courses: number;
  reached: number;
  completed: number;
  completedInPeriod: number;
}

export async function moduleStats(
  academyId: string,
  from: string,
  opts: { sort: ModuleSort; q?: string; limit: number; offset: number }
): Promise<{ rows: ModuleStat[]; total: number }> {
  // $1 = academy, $2 = search pattern (always present, '%' when not searching), $3 = range start.
  const pattern = opts.q ? `%${opts.q.replace(/[%_\\]/g, "\\$&")}%` : "%";
  // Items inside the sections of a "Module with sections" are part of that module, not separate rows here.
  const where = "m.academy_id = $1 AND m.parent_module_id IS NULL AND m.title ILIKE $2";
  const total = (await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM modules m WHERE ${where}`, [academyId, pattern]))?.n ?? 0;
  // "Needs attention" = the lowest completion rate among modules that have been reached; "popular" = most completions.
  const order =
    opts.sort === "popular"
      ? "completed_in_period DESC, completed DESC, title"
      : "(CASE WHEN reached = 0 THEN 1 ELSE 0 END), (completed::float / NULLIF(reached, 0)) ASC NULLS LAST, reached DESC, title";
  const rows = await queryAll<{ id: string; title: string; content_type: string; courses: number; reached: number; completed: number; completed_in_period: number }>(
    `SELECT * FROM (SELECT m.id, m.title, m.content_type,
        (SELECT count(*)::int FROM course_modules cm WHERE cm.module_id = m.id) AS courses,
        (SELECT count(*)::int FROM course_modules cm JOIN enrollments e ON e.course_id = cm.course_id WHERE cm.module_id = m.id AND e.academy_id = $1) AS reached,
        (SELECT count(*)::int FROM module_completions mc JOIN enrollments e ON e.id = mc.enrollment_id WHERE mc.module_id = m.id AND e.academy_id = $1) AS completed,
        (SELECT count(*)::int FROM module_completions mc JOIN enrollments e ON e.id = mc.enrollment_id WHERE mc.module_id = m.id AND e.academy_id = $1 AND mc.completed_at >= $3) AS completed_in_period
       FROM modules m WHERE ${where}) mm
      ORDER BY ${order} LIMIT $4 OFFSET $5`,
    [academyId, pattern, from, opts.limit, opts.offset]
  );
  return {
    total,
    rows: rows.map((r) => ({ id: r.id, title: r.title, content_type: r.content_type, courses: r.courses, reached: r.reached, completed: r.completed, completedInPeriod: r.completed_in_period })),
  };
}

// ---------------------------------------------------------------- learners

export type LearnerState = "not_started" | "active" | "inactive" | "finished";

export interface LearnerStat {
  id: string;
  name: string;
  email: string;
  joinedAt: string;
  courses: number;
  completed: number;
  avgProgress: number;
  lastActive: string | null;
  state: LearnerState;
}

export const LEARNER_STATES: Record<LearnerState, string> = {
  active: "Active",
  inactive: "Inactive",
  not_started: "Not started",
  finished: "Finished everything",
};

export async function learnerStats(
  academyId: string,
  opts: { q?: string; state?: LearnerState | ""; limit: number; offset: number; inactiveBefore?: string }
): Promise<{ rows: LearnerStat[]; total: number }> {
  const params: unknown[] = [academyId, opts.inactiveBefore ?? inactiveCutoff()];
  let search = "";
  if (opts.q) {
    params.push(`%${opts.q.replace(/[%_\\]/g, "\\$&")}%`);
    search = ` AND (u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
  }
  let stateFilter = "";
  if (opts.state && opts.state in LEARNER_STATES) {
    params.push(opts.state);
    stateFilter = ` WHERE state = $${params.length}`;
  }
  params.push(opts.limit, opts.offset);
  const rows = await queryAll<{
    id: string; name: string; email: string; created_at: string; courses: number; completed: number; avg_progress: number;
    last_ts: string | null; state: LearnerState; total: number;
  }>(
    `SELECT *, count(*) OVER ()::int AS total FROM (
        SELECT *, CASE WHEN courses = 0 THEN 'not_started'
                       WHEN completed = courses THEN 'finished'
                       WHEN last_ts < $2 THEN 'inactive'
                       ELSE 'active' END AS state
          FROM (
            SELECT u.id, u.name, u.email, u.created_at,
                   count(e.id)::int AS courses,
                   (count(e.id) FILTER (WHERE ${COMPLETED}))::int AS completed,
                   COALESCE(round(avg(e.progress_pct)), 0)::int AS avg_progress,
                   max(la.last_ts) AS last_ts
              FROM users u
              LEFT JOIN enrollments e ON e.learner_id = u.id AND e.academy_id = $1
              LEFT JOIN (${LAST_ACTIVITY}) la ON la.enrollment_id = e.id
             WHERE u.academy_id = $1 AND u.role = 'LEARNER' AND u.is_active = 1${search}
             GROUP BY u.id
          ) per
     ) s${stateFilter}
     ORDER BY (CASE state WHEN 'inactive' THEN 0 WHEN 'active' THEN 1 WHEN 'not_started' THEN 2 ELSE 3 END), last_ts ASC NULLS FIRST, name
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return {
    total: rows[0]?.total ?? 0,
    rows: rows.map((r) => ({
      id: r.id, name: r.name, email: r.email, joinedAt: r.created_at, courses: r.courses, completed: r.completed,
      avgProgress: r.avg_progress, lastActive: r.last_ts, state: r.state,
    })),
  };
}

// ---------------------------------------------------------------- CSV

/** One CSV cell. Cells that start with = + - @ would be run as formulas by a spreadsheet, so they get a leading apostrophe. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (typeof v !== "number" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return "﻿" + [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function pct(part: number, whole: number): number {
  return whole <= 0 ? 0 : Math.round((100 * part) / whole);
}
