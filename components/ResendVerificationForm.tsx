"use client";

import { useActionState } from "react";
import type { ResendVerificationState } from "@/lib/actions/emailVerification";

export default function ResendVerificationForm({
  action,
}: {
  action: (prevState: ResendVerificationState, formData: FormData) => Promise<ResendVerificationState>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  if (state?.message) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        {state.message}
      </div>
    );
  }

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
      <button type="submit" disabled={pending} className="app-btn-primary rounded-md py-2.5 text-sm font-semibold">
        {pending ? "Sending…" : "Resend verification link"}
      </button>
    </form>
  );
}
