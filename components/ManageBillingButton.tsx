"use client";

import { useActionState } from "react";
import type { BillingState } from "@/lib/actions/billing";

export default function ManageBillingButton({
  action,
}: {
  action: (prevState: BillingState, formData: FormData) => Promise<BillingState>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="grid gap-2">
      <button type="submit" disabled={pending} className="rounded-md px-4 py-2 text-sm font-semibold border border-gray-300 hover:bg-gray-50 w-fit">
        {pending ? "Opening…" : "Update card / view invoices in Stripe"}
      </button>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
