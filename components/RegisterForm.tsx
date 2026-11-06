"use client";

import { useActionState } from "react";
import type { RegisterState } from "@/lib/actions/register";
import { getT, type Lang } from "@/lib/i18n";

export default function RegisterForm({
  action,
  next,
  lang,
}: {
  action: (prevState: RegisterState, formData: FormData) => Promise<RegisterState>;
  next?: string;
  lang?: Lang;
}) {
  const t = getT(lang);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} style={{ display: "grid", gap: 16 }}>
      {next && <input type="hidden" name="next" value={next} />}
      <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: "#374151" }}>
        {t("field_full_name")}
        <input
          name="name"
          required
          className="rounded-md border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
          style={{ ["--tw-ring-color" as never]: "var(--brand-accent)" }}
        />
      </label>
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
        {t("field_password")}
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
        {t("field_confirm_password")}
        <input
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          className="rounded-md border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
          style={{ ["--tw-ring-color" as never]: "var(--brand-accent)" }}
        />
      </label>
      <p className="text-xs text-gray-400 -mt-2">{t("password_min")}</p>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending} className="app-btn-primary rounded-md py-2.5 text-sm font-semibold">
        {pending ? t("register_busy") : t("register_button")}
      </button>
    </form>
  );
}
