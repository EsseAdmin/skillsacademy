// Best-effort rolling log of what the outside services (email, Stripe)
// actually said, so the Super Admin "System check" page can show the real
// provider error instead of leaving it buried in hosting logs. Logging must
// never break the action it observes: every call swallows its own failures.
import { exec, queryAll, newId, nowIso } from "@/lib/db";

export type IntegrationKind = "email" | "stripe";
export type IntegrationLevel = "info" | "error";

export interface IntegrationEvent {
  id: string;
  kind: IntegrationKind;
  level: IntegrationLevel;
  message: string;
  detail: string | null;
  created_at: string;
}

const KEEP_ROWS = 200;

function clip(value: string | undefined | null, max: number): string | null {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) + "…" : value;
}

export async function logIntegrationEvent(e: { kind: IntegrationKind; level: IntegrationLevel; message: string; detail?: string }): Promise<void> {
  try {
    await exec(
      "INSERT INTO integration_events (id, kind, level, message, detail, created_at) VALUES ($1,$2,$3,$4,$5,$6)",
      [newId(), e.kind, e.level, clip(e.message, 500) ?? "", clip(e.detail, 2000), nowIso()]
    );
    await exec(
      "DELETE FROM integration_events WHERE id IN (SELECT id FROM integration_events ORDER BY created_at DESC OFFSET $1)",
      [KEEP_ROWS]
    );
  } catch (err) {
    console.error("[integration-log] could not record event:", err);
  }
}

export async function recentIntegrationEvents(limit = 40): Promise<IntegrationEvent[]> {
  try {
    return await queryAll<IntegrationEvent>("SELECT * FROM integration_events ORDER BY created_at DESC LIMIT $1", [limit]);
  } catch {
    return [];
  }
}
