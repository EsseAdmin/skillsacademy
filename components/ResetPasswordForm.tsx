"use client";

import { useActionState } from "react";
import type { ResetPasswordState } from "@/lib/actions/passwordReset";

export default function ResetPasswordForm({
  action,
  token,
}: {
  action: (prevState: ResetPasswordState, formData: FormData) => Promise<ResetPasswordState>;
  token: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} style={{ display: "grid", gap: 16 }}>
      <input type="hidden" name="token" value={token} />
      <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: "#374151" }}>
        New password
        <input
          name="password"
          type="password"
          required
          minLength={8}
          className="rounded-md border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
          style={{ ["--tw-ring-color" as never]: "var(--brand-accent)" }}
        />
      </label>
      <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: "#374151" }}>
        Confirm new password
        <input
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          className="rounded-md border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
          style={{ ["--tw-ring-color" as never]: "var(--brand-accent)" }}
        />
      </label>
      <p className="text-xs text-gray-400 -mt-2">At least 8 characters.</p>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending} className="app-btn-primary rounded-md py-2.5 text-sm font-semibold">
        {pending ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}
