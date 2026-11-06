"use client";

import { useActionState } from "react";
import { sendTestEmail, testStripeCheckout } from "@/lib/actions/health";

function Result({ state }: { state: { ok?: boolean; message?: string; url?: string } | undefined }) {
  if (!state?.message) return null;
  return (
    <div className={`mt-3 rounded-md border px-3 py-2 text-sm break-words ${state.ok ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-red-300 bg-red-50 text-red-800"}`}>
      {state.message}
      {state.url && (
        <>
          {" "}
          <a href={state.url} target="_blank" rel="noreferrer" className="app-link">
            Open the Stripe checkout page
          </a>
        </>
      )}
    </div>
  );
}

export function TestEmailForm({ to }: { to: string }) {
  const [state, action, pending] = useActionState(sendTestEmail, undefined);
  return (
    <form action={action}>
      <button type="submit" disabled={pending} className="rounded-md px-4 py-2 text-sm font-semibold border border-gray-300 hover:bg-gray-50">
        {pending ? "Sending…" : `Send a test email to ${to}`}
      </button>
      <Result state={state} />
    </form>
  );
}

export function TestCheckoutForm({ plans }: { plans: { id: string; name: string; price: string }[] }) {
  const [state, action, pending] = useActionState(testStripeCheckout, undefined);
  return (
    <form action={action}>
      <div className="flex flex-wrap items-center gap-3">
        <select name="planId" className="rounded-md border border-gray-300 px-3 py-2 text-sm" defaultValue={plans[0]?.id}>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.price}/month
            </option>
          ))}
        </select>
        <button type="submit" disabled={pending} className="rounded-md px-4 py-2 text-sm font-semibold border border-gray-300 hover:bg-gray-50">
          {pending ? "Asking Stripe…" : "Test checkout for this plan"}
        </button>
      </div>
      <Result state={state} />
    </form>
  );
}
