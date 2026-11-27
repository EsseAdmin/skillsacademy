// Remembers a function's answer for the rest of ONE page request, so the page, its layout and its metadata can all ask
// for the same thing and the database is only asked once. Outside a page render (scripts, tests) it does nothing.
import * as React from "react";

type AnyFn = (...args: never[]) => unknown;

export function perRequest<F extends AnyFn>(fn: F): F {
  const cache = (React as unknown as { cache?: <T extends AnyFn>(f: T) => T }).cache;
  return typeof cache === "function" ? cache(fn) : fn;
}
