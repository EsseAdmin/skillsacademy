"use client";

import { useActionState } from "react";
import { createPlan } from "@/lib/actions/superadmin";

export default function CreatePlanForm() {
  const [state, formAction, pending] = useActionState(createPlan, undefined);

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid md:grid-cols-4 gap-4">
        <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
          Key (unique id)
          <input name="key" required placeholder="e.g. scaleup" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
          Name
          <input name="name" required placeholder="e.g. Scale-Up" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
          Price (£/mo)
          <input name="price" type="number" step="0.01" required className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
          Trial days
          <input name="trial_days" type="number" defaultValue={14} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </label>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
          Max learners
          <input name="max_learners" type="number" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
          Max instructors
          <input name="max_instructors" type="number" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
          Max courses
          <input name="max_courses" type="number" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </label>
      </div>
      <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
        Features (one per line)
        <textarea name="features" rows={4} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
      </label>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div>
        <button type="submit" disabled={pending} className="app-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold">
          {pending ? "Creating…" : "Create Plan"}
        </button>
      </div>
    </form>
  );
}
