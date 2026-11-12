"use client";

import { useActionState, useState } from "react";
import type { BillingState } from "@/lib/actions/billing";
import { safeAction } from "@/lib/safeAction";

// Danger-zone form on the academy admin's Billing page. Controlled inputs so a
// failed attempt (e.g. the box wasn't ticked) doesn't wipe what was typed.
export default function CancelSubscriptionForm({
  action,
  academyName,
  hasPaidSubscription,
}: {
  action: (prevState: BillingState, formData: FormData) => Promise<BillingState>;
  academyName: string;
  hasPaidSubscription: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    safeAction(action, "Something went wrong sending your request. Nothing has been cancelled — please try again."),
    undefined
  );
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  return (
    <form action={formAction} className="grid gap-4" data-testid="cancel-form">
      <p className="text-sm text-gray-700">
        This cancels your subscription and asks us to delete <strong>{academyName}</strong> and everything in it: courses, modules,
        learners and results.{" "}
        {hasPaidSubscription
          ? "Your subscription is switched off straight away, so no further payments are taken."
          : "You're still on the free trial, so no payment will be taken."}{" "}
        The platform team is emailed immediately, and your academy is archived automatically 24 hours after you send this request:
        it is hidden from your learners and staff, and we then delete it. Until it is archived you can change your mind and withdraw the request.
      </p>
      <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
        Why are you leaving? (optional)
        <textarea
          name="reason"
          rows={3}
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm font-normal"
          data-testid="cancel-reason"
        />
      </label>
      <label className="flex items-start gap-2 text-sm text-gray-800">
        <input
          type="checkbox"
          name="confirm"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5"
          data-testid="cancel-confirm"
        />
        <span>I understand this will cancel my subscription and my academy will be deleted.</span>
      </label>
      {state?.error && <p className="text-sm text-red-600" data-testid="cancel-error">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md px-4 py-2 text-sm font-semibold bg-red-600 text-white hover:bg-red-700 w-fit disabled:opacity-60"
        data-testid="cancel-submit"
      >
        {pending ? "Cancelling…" : "Cancel subscription & request deletion"}
      </button>
    </form>
  );
}
