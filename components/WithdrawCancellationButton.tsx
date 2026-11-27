"use client";

import { useActionState } from "react";
import type { BillingState } from "@/lib/actions/billing";
import { safeAction } from "@/lib/safeAction";

export default function WithdrawCancellationButton({
  action,
}: {
  action: (prevState: BillingState, formData: FormData) => Promise<BillingState>;
}) {
  const [state, formAction, pending] = useActionState(
    safeAction(action, "Something went wrong. Your request is unchanged — please try again."),
    undefined
  );
  return (
    <form action={formAction} className="grid gap-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md px-4 py-2 text-sm font-semibold border border-gray-300 bg-white hover:bg-gray-50 w-fit disabled:opacity-60"
        data-testid="withdraw-submit"
      >
        {pending ? "Withdrawing…" : "Withdraw my request and keep my academy"}
      </button>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
