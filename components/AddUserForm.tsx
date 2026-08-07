"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/lib/actions/auth";

export default function AddUserForm({
  action,
  allowInstructor,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  allowInstructor: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [setPasswordManually, setSetPasswordManually] = useState(false);

  return (
    <form action={formAction} className="grid md:grid-cols-4 gap-4 items-end">
      <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
        Full name
        <input name="name" required className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
      </label>
      <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
        Email
        <input name="email" type="email" required className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
      </label>
      <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
        Role
        <select name="role" className="rounded-md border border-gray-300 px-3 py-2 text-sm" defaultValue="LEARNER">
          <option value="LEARNER">Learner</option>
          {allowInstructor && <option value="INSTRUCTOR">Instructor</option>}
        </select>
      </label>
      <button type="submit" disabled={pending} className="app-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold">
        {pending ? "Adding…" : "Add Person"}
      </button>

      <label className="text-xs font-semibold text-gray-600 flex items-center gap-2 md:col-span-4">
        <input
          type="checkbox"
          checked={setPasswordManually}
          onChange={(e) => setSetPasswordManually(e.target.checked)}
        />
        Set their password myself, instead of emailing them a link
      </label>

      {setPasswordManually && (
        <label className="text-xs font-semibold text-gray-600 grid gap-1.5 md:col-span-2">
          Password
          <input
            name="password"
            type="text"
            minLength={8}
            placeholder="At least 8 characters"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-mono"
          />
        </label>
      )}

      {state?.error && <p className="text-sm text-red-600 md:col-span-4">{state.error}</p>}
      <p className="text-xs text-gray-400 md:col-span-4">
        {setPasswordManually
          ? "They'll be able to log in with this password right away — make sure you share it with them yourself."
          : "We'll email them a link to set their own password."}
      </p>
    </form>
  );
}
