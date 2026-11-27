"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { FormState } from "@/lib/actions/auth";
import { getT, type Lang } from "@/lib/i18n";

export default function LoginForm({
  action,
  submitLabel,
  lang,
  demoHint,
  forgotPasswordHref,
  next,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  submitLabel?: string;
  demoHint?: string;
  forgotPasswordHref?: string;
  // Where a learner should land after signing in (validated again on the server).
  next?: string;
  // Language of the academy the form belongs to (English when omitted).
  lang?: Lang;
}) {
  const t = getT(lang);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} style={{ display: "grid", gap: 16 }}>
      {next && <input type="hidden" name="next" value={next} />}
      <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: "#374151" }}>
        {t("field_email")}
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
          {t("field_password")}
          {forgotPasswordHref && (
            <Link href={forgotPasswordHref} className="app-link text-xs font-medium normal-case" style={{ fontWeight: 500 }}>
              {t("forgot_link")}
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
        {pending ? t("login_busy") : (submitLabel ?? t("login_button"))}
      </button>
      {demoHint && <p className="text-xs text-gray-400 mt-1">{demoHint}</p>}
    </form>
  );
}
