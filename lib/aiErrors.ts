// True for the Anthropic SDK's timeout/abort errors (matched by name so this
// stays importable without pulling the SDK into client bundles).
export function isAiTimeout(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name ?? "";
  return name === "APIConnectionTimeoutError" || name === "AbortError" || /timed? ?out/i.test(String((err as Error)?.message ?? ""));
}
