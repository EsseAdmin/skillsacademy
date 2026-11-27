// Complimentary ("free") academies. Only the platform's Super Admin can grant this. It means: no payment is asked for, and no
// trial / subscribe prompts are shown, either for a chosen period (until the end of a date) or with no end. It is separate from
// the Stripe subscription status, so nothing at Stripe is touched, and when a dated period runs out the academy simply falls
// back to its normal trial / subscription state (nothing needs to run for that to happen).

export interface ComplimentaryFields {
  is_complimentary: number;
  complimentary_until: string | null;
  complimentary_note: string | null;
  complimentary_granted_at: string | null;
}

export interface ComplimentaryState {
  /** Granted at all (even if a dated period has since ended). */
  granted: boolean;
  /** Granted and not yet ended: the academy is currently free. */
  active: boolean;
  /** Free with no end date. */
  unlimited: boolean;
  /** A dated grant whose end has passed. */
  expired: boolean;
  until: string | null;
  daysLeft: number | null;
}

export function complimentaryState(a: ComplimentaryFields, now: number = Date.now()): ComplimentaryState {
  const granted = a.is_complimentary === 1;
  if (!granted) return { granted: false, active: false, unlimited: false, expired: false, until: null, daysLeft: null };
  if (!a.complimentary_until) return { granted, active: true, unlimited: true, expired: false, until: null, daysLeft: null };
  const end = new Date(a.complimentary_until).getTime();
  const active = end > now;
  return { granted, active, unlimited: false, expired: !active, until: a.complimentary_until, daysLeft: active ? Math.max(1, Math.ceil((end - now) / 86_400_000)) : 0 };
}

export const isComplimentaryActive = (a: ComplimentaryFields) => complimentaryState(a).active;

export const MAX_COMPLIMENTARY_YEARS = 10;

/** A "YYYY-MM-DD" date typed by the Super Admin -> the end of that day (UTC), or an error. Must be in the future, within 10 years. */
export function parseComplimentaryEnd(raw: string, now: number = Date.now()): { ok: true; iso: string } | { ok: false; error: string } {
  const v = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false, error: "Choose the date the free period should end." };
  const d = new Date(`${v}T23:59:59.999Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return { ok: false, error: "That isn't a real date." };
  if (d.getTime() <= now) return { ok: false, error: "The end date must be in the future." };
  if (d.getTime() > now + MAX_COMPLIMENTARY_YEARS * 366 * 86_400_000) return { ok: false, error: `Pick a date within ${MAX_COMPLIMENTARY_YEARS} years, or choose "no end date".` };
  return { ok: true, iso: d.toISOString() };
}

export function cleanNote(raw: string): string | null {
  const v = raw.replace(/\s+/g, " ").trim().slice(0, 200);
  return v || null;
}
