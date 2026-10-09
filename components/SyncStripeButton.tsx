"use client";

import { useActionState } from "react";
import { syncPlansToStripe } from "@/lib/actions/superadmin";

export default function SyncStripeButton() {
  const [state, formAction, pending] = useActionState(syncPlansToStripe, undefined);

  return (
    <form action={formAction} className="grid gap-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md px-4 py-2 text-sm font-semibold border border-gray-300 hover:bg-gray-50 w-fit"
      >
        {pending ? "Syncing…" : "Sync plans to Stripe"}
      </button>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.message && <p className="text-sm text-emerald-600">{state.message}</p>}
    </form>
  );
}
