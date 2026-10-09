"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/actions/auth";

export default function CheckoutForm({
  action,
  amountLabel,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  amountLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="grid gap-4">
      <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
        Name on card
        <input name="nameOnCard" required className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="Jane Smith" />
      </label>
      <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
        Card number
        <input name="cardNumber" required defaultValue="4242 4242 4242 4242" className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="4242 4242 4242 4242" />
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
          Expiry (MM/YY)
          <input name="expiry" required defaultValue="12/29" className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="12/29" />
        </label>
        <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
          CVC
          <input name="cvc" required defaultValue="123" className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="123" />
        </label>
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending} className="app-btn-accent rounded-md px-5 py-3 text-sm">
        {pending ? "Processing payment…" : `Pay ${amountLabel}`}
      </button>
      <p className="text-xs text-gray-400 text-center">
        This is a simulated checkout for demo purposes — no real card is charged.
      </p>
    </form>
  );
}
