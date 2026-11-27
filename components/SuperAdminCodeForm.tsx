"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/actions/auth";

export default function SuperAdminCodeForm({
  verify,
  resend,
}: {
  verify: (prev: FormState, fd: FormData) => Promise<FormState>;
  resend: (prev: FormState) => Promise<FormState>;
}) {
  const [state, verifyAction, verifying] = useActionState(verify, undefined);
  const [resendState, resendAction, resending] = useActionState(resend, undefined);
  const error = state?.error ?? resendState?.error;
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <form action={verifyAction} style={{ display: "grid", gap: 16 }}>
        <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: "#374151" }}>
          6-digit code
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,7}"
            maxLength={7}
            required
            autoFocus
            data-testid="sa-code"
            className="rounded-md border border-gray-300 px-3 py-2.5 text-center text-xl tracking-[0.4em] focus:outline-none focus:ring-2"
            style={{ ["--tw-ring-color" as never]: "var(--brand-accent)" }}
          />
        </label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {!error && resendState?.info && <p role="status" className="text-sm text-emerald-700">{resendState.info}</p>}
        <button type="submit" disabled={verifying} className="app-btn-primary rounded-md py-2.5 text-sm font-semibold">
          {verifying ? "Checking…" : "Sign in"}
        </button>
      </form>
      <form action={resendAction}>
        <button type="submit" disabled={resending} className="app-link text-sm" data-testid="sa-resend">
          {resending ? "Sending…" : "Send a new code"}
        </button>
      </form>
    </div>
  );
}
