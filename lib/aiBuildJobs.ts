// The queue behind "Generate with AI" content building.
//
// Why a queue: Netlify cuts a request off at about 30 seconds (the gateway
// returns a 504), and a planned module that becomes a PowerPoint plus a Word
// exercise sheet needs two AI calls plus file building and storing. Building a
// whole plan in one request therefore sometimes ran out of time. Instead the
// plan's structure (theme, homepage text, courses) is saved straight away and
// every module becomes a job here; the admin's browser then asks for one step
// at a time, each comfortably inside the limit (see components/PlanBuildProgress).
//
// Rules: jobs only ever come from our own plan sanitiser, a step only claims
// jobs of the caller's own academy, a job is claimed atomically (two tabs can't
// build the same module twice), and a step that dies half-way is picked up
// again after a minute.
import { queryAll, queryOne, exec, newId, nowIso } from "@/lib/db";
import { Academies, Courses, Modules } from "@/lib/queries";
import { buildModulePack, type ContentProvider, type ModuleSpec } from "@/lib/aiModuleBuild";

// A step must finish well inside Netlify's ~30s: the AI calls get what is left
// of this budget (minus a reserve for building and storing the files).
export const STEP_BUDGET_MS = 21_000;
const STALE_RUNNING_MS = 60_000;

export interface BuildJobPayload {
  spec: ModuleSpec;
  primary: string;
  accent: string;
}

interface JobRow {
  id: string;
  batch_id: string;
  academy_id: string;
  course_id: string;
  created_by: string;
  slot: number;
  payload_json: string;
  status: "PENDING" | "RUNNING" | "DONE" | "FAILED";
}

export interface BuildProgress {
  total: number;
  done: number;
  pending: number;
  failed: number;
  richModuleCount: number;
  fallbackCount: number;
}

const EMPTY: BuildProgress = { total: 0, done: 0, pending: 0, failed: 0, richModuleCount: 0, fallbackCount: 0 };

export async function queueBuildJobs(
  academyId: string,
  createdBy: string,
  jobs: { courseId: string; slot: number; payload: BuildJobPayload }[]
): Promise<string> {
  const batchId = newId();
  for (const j of jobs) {
    await exec(
      `INSERT INTO ai_build_jobs (id, batch_id, academy_id, course_id, created_by, slot, payload_json, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING',$8)`,
      [newId(), batchId, academyId, j.courseId, createdBy, j.slot, JSON.stringify(j.payload), nowIso()]
    );
  }
  return batchId;
}

/** Progress of the academy's most recent batch (all zeros if there never was one). */
export async function buildProgress(academyId: string): Promise<BuildProgress> {
  const latest = await queryOne<{ batch_id: string }>("SELECT batch_id FROM ai_build_jobs WHERE academy_id = $1 ORDER BY seq DESC LIMIT 1", [academyId]);
  if (!latest) return EMPTY;
  const r = await queryOne<{ total: number; done: number; pending: number; failed: number; rich: number; fb: number }>(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status IN ('DONE','FAILED'))::int AS done,
            COUNT(*) FILTER (WHERE status IN ('PENDING','RUNNING'))::int AS pending,
            COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed,
            COALESCE(SUM(rich_count), 0)::int AS rich,
            COALESCE(SUM(fallback_count), 0)::int AS fb
       FROM ai_build_jobs WHERE academy_id = $1 AND batch_id = $2`,
    [academyId, latest.batch_id]
  );
  if (!r) return EMPTY;
  return { total: r.total, done: r.done, pending: r.pending, failed: r.failed, richModuleCount: r.rich, fallbackCount: r.fb };
}

async function claimNext(academyId: string): Promise<JobRow | undefined> {
  // Give back jobs whose step died (a dropped request) so they aren't stuck.
  await exec(
    "UPDATE ai_build_jobs SET status = 'PENDING' WHERE academy_id = $1 AND status = 'RUNNING' AND started_at < $2",
    [academyId, new Date(Date.now() - STALE_RUNNING_MS).toISOString()]
  );
  const rows = await queryAll<JobRow>(
    `UPDATE ai_build_jobs SET status = 'RUNNING', started_at = $2
      WHERE id = (SELECT id FROM ai_build_jobs WHERE academy_id = $1 AND status = 'PENDING' ORDER BY seq LIMIT 1 FOR UPDATE SKIP LOCKED)
      RETURNING id, batch_id, academy_id, course_id, created_by, slot, payload_json, status`,
    [academyId, nowIso()]
  );
  return rows[0];
}

function parsePayload(raw: string): BuildJobPayload | null {
  try {
    const p = JSON.parse(raw) as BuildJobPayload;
    return p && p.spec && typeof p.spec.title === "string" ? p : null;
  } catch {
    return null;
  }
}

// Modules that need no AI call finish in milliseconds, so several can share a step.
function needsAi(spec: ModuleSpec): boolean {
  return spec.kind === "SLIDES" || spec.kind === "DOCUMENT" || spec.kind === "SCORM" || (spec.kind === "VIDEO" && !spec.url);
}

async function runJob(job: JobRow, deadline: number, provider?: ContentProvider): Promise<void> {
  const payload = parsePayload(job.payload_json);
  const course = await Courses.byId(job.course_id);
  if (!payload || !course || course.academy_id !== job.academy_id) {
    await exec("UPDATE ai_build_jobs SET status='FAILED', error=$2, finished_at=$3 WHERE id=$1", [job.id, "The job or its course no longer exists.", nowIso()]);
    return;
  }
  try {
    const academy = await Academies.byId(job.academy_id);
    const pack = await buildModulePack(payload.spec, {
      academyId: job.academy_id,
      createdByUserId: job.created_by,
      academyName: academy?.name || "Academy",
      courseTitle: course.title,
      courseDescription: course.description,
      primaryColor: payload.primary,
      accentColor: payload.accent,
      deadline,
      provider,
    });
    let rich = 0;
    let fallback = pack.skippedExercises;
    let k = 0;
    for (const r of pack.results) {
      await Modules.assignToCourse(job.course_id, r.module.id, job.slot + k++);
      if (r.fellBack) fallback++;
      else if (r.kind !== "TEXT") rich++;
    }
    await exec("UPDATE ai_build_jobs SET status='DONE', rich_count=$2, fallback_count=$3, finished_at=$4 WHERE id=$1", [job.id, rich, fallback, nowIso()]);
  } catch (err) {
    console.error(`[ai] Build job ${job.id} failed:`, err);
    await exec("UPDATE ai_build_jobs SET status='FAILED', error=$2, finished_at=$3 WHERE id=$1", [job.id, String((err as Error)?.message ?? err).slice(0, 300), nowIso()]);
  }
}

/**
 * One step: build the next pending module (and, if the following ones need no
 * AI call, those too). Returns the batch's progress afterwards.
 */
export async function runBuildStep(academyId: string, opts: { budgetMs?: number; provider?: ContentProvider } = {}): Promise<BuildProgress & { ranJobs: number }> {
  const deadline = Date.now() + (opts.budgetMs ?? STEP_BUDGET_MS);
  let ran = 0;
  for (;;) {
    const job = await claimNext(academyId);
    if (!job) break;
    await runJob(job, deadline, opts.provider);
    ran++;
    // Only keep going while the next job is cheap; an AI job gets its own step.
    const next = await queryOne<{ payload_json: string }>("SELECT payload_json FROM ai_build_jobs WHERE academy_id = $1 AND status = 'PENDING' ORDER BY seq LIMIT 1", [academyId]);
    const nextPayload = next ? parsePayload(next.payload_json) : null;
    if (!nextPayload || needsAi(nextPayload.spec)) break;
  }
  return { ...(await buildProgress(academyId)), ranJobs: ran };
}

/** Try the failed jobs of the latest batch again. */
export async function retryFailedJobs(academyId: string): Promise<void> {
  const latest = await queryOne<{ batch_id: string }>("SELECT batch_id FROM ai_build_jobs WHERE academy_id = $1 ORDER BY seq DESC LIMIT 1", [academyId]);
  if (!latest) return;
  await exec("UPDATE ai_build_jobs SET status='PENDING', error=NULL WHERE academy_id=$1 AND batch_id=$2 AND status='FAILED'", [academyId, latest.batch_id]);
}
