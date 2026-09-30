"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { FormState } from "@/lib/actions/auth";

export default function LoginForm({
  action,
  submitLabel = "Log In",
  demoHint,
  forgotPasswordHref,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  submitLabel?: string;
  demoHint?: string;
  forgotPasswordHref?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} style={{ display: "grid", gap: 16 }}>
      <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: "#374151" }}>
        Email
        <input
          name="email"
          type="email"
          required
          className="rounded-md border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
          style={{ ["--tw-ring-color" as never]: "var(--brand-accent)" }}
        />
      </label>
      <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: "#374151" }}>
        <span className="flex items-center justify-between">
          Password
          {forgotPasswordHref && (
            <Link href={forgotPasswordHref} className="app-link text-xs font-medium normal-case" style={{ fontWeight: 500 }}>
              Forgot your password?
            </Link>
          )}
        </span>
        <input
          name="password"
          type="password"
          required
          className="rounded-md border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
          style={{ ["--tw-ring-color" as never]: "var(--brand-accent)" }}
        />
      </label>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending} className="app-btn-primary rounded-md py-2.5 text-sm font-semibold">
        {pending ? "Signing in…" : submitLabel}
      </button>
      {demoHint && <p className="text-xs text-gray-400 mt-1">{demoHint}</p>}
    </form>
  );
}
