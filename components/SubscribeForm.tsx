"use client";

import { useActionState } from "react";
import type { BillingState } from "@/lib/actions/billing";
import { formatGBP } from "@/lib/utils";

interface Plan {
  id: string;
  key: string;
  name: string;
  price_pence: number;
}

export default function SubscribeForm({
  action,
  plans,
  defaultPlanKey,
}: {
  action: (prevState: BillingState, formData: FormData) => Promise<BillingState>;
  plans: Plan[];
  defaultPlanKey: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="grid md:grid-cols-2 gap-6">
      <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
        Plan
        <select name="plan" defaultValue={defaultPlanKey} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
          {plans.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name} — {formatGBP(p.price_pence)}/mo
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-col justify-end gap-3">
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button type="submit" disabled={pending} className="app-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold">
          {pending ? "Redirecting…" : "Continue to secure checkout"}
        </button>
        <p className="text-xs text-gray-400">You&apos;ll enter payment details on Stripe&apos;s secure checkout page.</p>
      </div>
    </form>
  );
}
