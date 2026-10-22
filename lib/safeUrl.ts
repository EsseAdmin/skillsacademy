// Shared URL guard for anything that ends up in an <a href> or <iframe src>
// on a learner-facing page. Only plain http(s) links are ever allowed —
// never javascript:, data:, file: etc. — and credentials embedded in the
// URL (https://user:pass@host) are rejected too. Returns the normalised
// URL string, or null if the value isn't acceptable.
export function safeHttpUrl(value: unknown, opts: { httpsOnly?: boolean } = {}): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2000) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && !opts.httpsOnly)) return null;
  if (parsed.username || parsed.password) return null;
  return parsed.toString();
}
