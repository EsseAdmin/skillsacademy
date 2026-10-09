// Wraps a server action used with useActionState so that a transport-level
// failure (Netlify's 60s function cap, a dropped connection, a deploy in
// flight) comes back as an ordinary error state shown inline, instead of
// throwing into React and replacing the whole page with "This page couldn't
// load". Server-side errors are already returned as states by the actions
// themselves; this only catches what never reached them.
export function safeAction<S extends { error?: string } | undefined, F>(
  action: (prev: S, formData: F) => Promise<S>,
  message: string,
): (prev: S, formData: F) => Promise<S> {
  return async (prev, formData) => {
    try {
      return await action(prev, formData);
    } catch (err) {
      // A redirect() inside an action travels as an error; let it through.
      const digest = (err as { digest?: unknown } | null)?.digest;
      if (typeof digest === "string" && digest.startsWith("NEXT_")) throw err;
      console.error("[action] request failed before a result came back:", err);
      return { error: message } as S;
    }
  };
}
