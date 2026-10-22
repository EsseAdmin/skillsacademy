// "Where to go after signing in": only ever a learner page of the same
// academy (so a crafted ?next= link can't send someone to another site or area).
export function safeLearnerNext(slug: string, raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const prefix = `/a/${slug}/learner/`;
  if (!raw.startsWith(prefix) || raw.length > 200) return null;
  if (!/^[A-Za-z0-9/_-]+$/.test(raw)) return null; // no dots, queries, backslashes or encoded tricks
  if (raw.includes("//")) return null;
  return raw;
}
