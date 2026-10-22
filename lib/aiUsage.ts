// AI usage metering and the monthly cap.
//
// Every Anthropic call made for an academy costs real money (the platform
// owner pays per token), so each one is counted against that academy's plan.
// The unit is one *AI action* = one Anthropic API call: a rewrite, a slide
// deck, a Word handout, an exercise sheet, an academy outline. The cap resets
// at the start of each calendar month (UTC) and comes from the academy's plan
// (subscription_plans.ai_monthly_limit, editable by the super admin; blank =
// the built-in default below).
//
// How it is wired: tenant code wraps its work in withAiMeter({ academyId,
// ... }, fn). The two places that actually call Anthropic (lib/ai.ts and
// lib/aiModuleContent.ts) run every call through meteredCall(), which looks
// the context up, reserves a usage row *before* calling (atomically refusing
// if the cap is reached), then records the token counts afterwards. Because
// the reservation happens first, parallel calls and retries can't slip past
// the limit by more than the odd request in a race.
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { queryAll, queryOne, exec, newId, nowIso } from "@/lib/db";
import { Plans, Academies, type SubscriptionPlan } from "@/lib/queries";

export type AiSource = "agent" | "generate" | "signup";

export interface AiMeterContext {
  academyId: string;
  userId?: string | null;
  source: AiSource;
  label?: string;
}

const storage = new AsyncLocalStorage<AiMeterContext>();

/** Runs `fn` so every Anthropic call inside it is counted against `ctx.academyId`. */
export function withAiMeter<T>(ctx: AiMeterContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}

export class AiLimitError extends Error {
  readonly used: number;
  readonly limit: number;
  constructor(used: number, limit: number) {
    super(`This academy has used ${used} of its ${limit} AI actions for the month.`);
    this.name = "AiLimitError";
    this.used = used;
    this.limit = limit;
  }
}

export function isAiLimitError(err: unknown): err is AiLimitError {
  return err instanceof AiLimitError || (err as { name?: string } | null)?.name === "AiLimitError";
}

// Built-in monthly caps, used for any plan whose ai_monthly_limit is blank.
export const DEFAULT_AI_LIMITS: Record<string, number> = { starter: 30, growth: 150, enterprise: 600 };
export const FALLBACK_AI_LIMIT = 50;

export function aiLimitForPlan(plan: Pick<SubscriptionPlan, "key" | "ai_monthly_limit"> | undefined | null): number {
  if (!plan) return FALLBACK_AI_LIMIT;
  if (plan.ai_monthly_limit !== null && plan.ai_monthly_limit !== undefined) return Math.max(0, plan.ai_monthly_limit);
  return DEFAULT_AI_LIMITS[plan.key] ?? FALLBACK_AI_LIMIT;
}

export function monthStartIso(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}
export function nextMonthStartIso(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

export interface AiUsageSummary {
  used: number;
  limit: number;
  remaining: number;
  planName: string;
  resetsAt: string;
  inputTokens: number;
  outputTokens: number;
}

export async function getAiUsage(academyId: string): Promise<AiUsageSummary> {
  const academy = await Academies.byId(academyId);
  const plan = academy ? await Plans.byId(academy.plan_id) : undefined;
  const limit = aiLimitForPlan(plan);
  const row = await queryOne<{ used: string; input_tokens: string | null; output_tokens: string | null }>(
    `SELECT count(*) AS used, COALESCE(sum(input_tokens), 0) AS input_tokens, COALESCE(sum(output_tokens), 0) AS output_tokens
     FROM ai_usage WHERE academy_id = $1 AND created_at >= $2`,
    [academyId, monthStartIso()]
  );
  const used = Number(row?.used ?? 0);
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    planName: plan?.name ?? "your plan",
    resetsAt: nextMonthStartIso(),
    inputTokens: Number(row?.input_tokens ?? 0),
    outputTokens: Number(row?.output_tokens ?? 0),
  };
}

export interface AiUsageRow {
  id: string;
  user_id: string | null;
  user_name: string | null;
  source: string;
  label: string | null;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
}

export async function recentAiUsage(academyId: string, limit = 15): Promise<AiUsageRow[]> {
  return queryAll<AiUsageRow>(
    `SELECT u.id, u.user_id, usr.name AS user_name, u.source, u.label, u.input_tokens, u.output_tokens, u.created_at
     FROM ai_usage u LEFT JOIN users usr ON usr.id = u.user_id
     WHERE u.academy_id = $1 ORDER BY u.created_at DESC LIMIT $2`,
    [academyId, limit]
  );
}

/** Usage for every academy this month — for the super-admin overview. */
export async function aiUsageByAcademy(): Promise<{ academy_id: string; used: number }[]> {
  const rows = await queryAll<{ academy_id: string; used: string }>(
    "SELECT academy_id, count(*) AS used FROM ai_usage WHERE created_at >= $1 GROUP BY academy_id",
    [monthStartIso()]
  );
  return rows.map((r) => ({ academy_id: r.academy_id, used: Number(r.used) }));
}

/**
 * Reserves one AI action for the academy in the current context, or throws
 * AiLimitError when its monthly cap is already reached. Returns the usage
 * row id, or null when there is no academy context (the public signup
 * preview, which has its own per-visitor limit below).
 */
export async function reserveAiAction(): Promise<string | null> {
  const ctx = storage.getStore();
  if (!ctx) return null;
  const academy = await Academies.byId(ctx.academyId);
  const plan = academy ? await Plans.byId(academy.plan_id) : undefined;
  const limit = aiLimitForPlan(plan);
  const id = newId();
  // One statement: insert the row only while the month's count is below the
  // cap, so two simultaneous requests can't both take the last action.
  const row = await queryOne<{ id: string }>(
    `INSERT INTO ai_usage (id, academy_id, user_id, source, label, created_at)
     SELECT $1, $2, $3, $4, $5, $6
     WHERE (SELECT count(*) FROM ai_usage WHERE academy_id = $2 AND created_at >= $7) < $8
     RETURNING id`,
    [id, ctx.academyId, ctx.userId ?? null, ctx.source, ctx.label ?? null, nowIso(), monthStartIso(), limit]
  );
  if (!row) {
    const { used } = await getAiUsage(ctx.academyId);
    throw new AiLimitError(used, limit);
  }
  return row.id;
}

export async function recordAiTokens(usageId: string, usage: { input_tokens?: number; output_tokens?: number } | undefined): Promise<void> {
  if (!usageId || !usage) return;
  await exec("UPDATE ai_usage SET input_tokens = $1, output_tokens = $2 WHERE id = $3", [
    Math.max(0, Math.trunc(usage.input_tokens ?? 0)),
    Math.max(0, Math.trunc(usage.output_tokens ?? 0)),
    usageId,
  ]).catch((err) => console.error("[ai-usage] couldn't record token counts:", err));
}

/**
 * Wraps one Anthropic API call so it is counted and capped. Everything that
 * talks to Anthropic goes through this — never call messages.create directly.
 */
export async function meteredCall<T extends { usage?: { input_tokens?: number; output_tokens?: number } }>(fn: () => Promise<T>): Promise<T> {
  const usageId = await reserveAiAction();
  const result = await fn();
  if (usageId) await recordAiTokens(usageId, result.usage);
  return result;
}

/** Friendly sentence for when the cap stops a request. */
export function aiLimitMessage(err: AiLimitError, resetsAt = nextMonthStartIso()): string {
  const when = new Date(resetsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
  return `Your academy has used all ${err.limit} AI actions included in its plan this month. The allowance resets on ${when} — or upgrade your plan for more.`;
}

// ---------- Public signup preview (no academy yet) ----------
const PUBLIC_PER_VISITOR_PER_HOUR = 6;
const PUBLIC_PER_DAY_TOTAL = 400;

export function hashVisitor(ip: string): string {
  const salt = process.env.SESSION_SECRET || process.env.AUTH_SECRET || "skillsacademy";
  return createHash("sha256").update(`${salt}|${ip}`).digest("hex").slice(0, 32);
}

/** Records and checks one signup-preview AI call; false = over the limit. */
export async function allowPublicAiCall(ip: string): Promise<boolean> {
  const visitor = hashVisitor(ip || "unknown");
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const row = await queryOne<{ id: string }>(
    `INSERT INTO ai_public_usage (id, visitor_hash, created_at)
     SELECT $1, $2, $3
     WHERE (SELECT count(*) FROM ai_public_usage WHERE visitor_hash = $2 AND created_at >= $4) < $5
       AND (SELECT count(*) FROM ai_public_usage WHERE created_at >= $6) < $7
     RETURNING id`,
    [newId(), visitor, nowIso(), hourAgo, PUBLIC_PER_VISITOR_PER_HOUR, dayAgo, PUBLIC_PER_DAY_TOTAL]
  );
  if (row) {
    // Keep the table small: nothing older than two days is ever consulted.
    await exec("DELETE FROM ai_public_usage WHERE created_at < $1", [new Date(Date.now() - 2 * 86_400_000).toISOString()]).catch(() => {});
  }
  return !!row;
}
