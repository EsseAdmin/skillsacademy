"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/actions/auth";
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
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  plans: Plan[];
  defaultPlanKey: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="grid md:grid-cols-2 gap-6">
      <div className="grid gap-4">
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
        <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
          Card number
          <input name="cardNumber" required defaultValue="4242 4242 4242 4242" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Expiry
            <input name="expiry" required defaultValue="12/29" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            CVC
            <input name="cvc" required defaultValue="123" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </label>
        </div>
      </div>
      <div className="flex flex-col justify-end gap-3">
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button type="submit" disabled={pending} className="app-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold">
          {pending ? "Processing…" : "Confirm Subscription"}
        </button>
        <p className="text-xs text-gray-400">Simulated payment — no real card is charged.</p>
      </div>
    </form>
  );
}
