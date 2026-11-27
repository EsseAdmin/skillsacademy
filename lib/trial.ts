// One place that turns the plans' trial lengths (set by the super admin under
// Subscription Plans) into the wording used on the public homepage, the
// sign-up page and the pricing cards. Nothing public should hard-code a
// number of days: change a plan's trial and every one of these follows.

export const MAX_TRIAL_DAYS = 365;

export interface TrialSummary {
  // false when no active plan offers a trial at all.
  hasTrial: boolean;
  // Shortest and longest trial across the plans that offer one.
  min: number;
  max: number;
  // True when every plan with a trial offers the same length.
  uniform: boolean;
  // "14", or "7–14" when plans differ. Empty when there is no trial.
  number: string;
  // "14-day free trial", "7–14 day free trial", or "free trial" fallback.
  phrase: string;
  // "14-day" / "7–14 day" / "" for building sentences.
  adjective: string;
}

/** Parses a trial length typed by an admin; null when it isn't a sensible number of days. */
export function parseTrialDays(raw: unknown): number | null {
  const text = String(raw ?? "").trim();
  if (!/^\d{1,3}$/.test(text)) return null;
  const n = parseInt(text, 10);
  return n >= 0 && n <= MAX_TRIAL_DAYS ? n : null;
}

export function dayWord(n: number): string {
  return n === 1 ? "day" : "days";
}

/** Wording for one plan's own card. */
export function planTrialPhrase(trialDays: number): string {
  return trialDays > 0 ? `${trialDays}-day free trial` : "No free trial";
}

export function summariseTrials(plans: Array<{ trial_days: number }>): TrialSummary {
  const lengths = plans.map((p) => p.trial_days).filter((d) => Number.isFinite(d) && d > 0);
  if (lengths.length === 0) {
    return { hasTrial: false, min: 0, max: 0, uniform: true, number: "", phrase: "free trial", adjective: "" };
  }
  const min = Math.min(...lengths);
  const max = Math.max(...lengths);
  const uniform = min === max;
  // Plans without a trial among plans with one means "every plan includes a
  // trial" would be untrue, which the pages check via allPlansHaveTrial.
  const number = uniform ? String(min) : `${min}–${max}`;
  const adjective = uniform ? `${min}-day` : `${min}–${max} day`;
  return { hasTrial: true, min, max, uniform, number, phrase: `${adjective} free trial`, adjective };
}

export function allPlansHaveTrial(plans: Array<{ trial_days: number }>): boolean {
  return plans.length > 0 && plans.every((p) => p.trial_days > 0);
}
