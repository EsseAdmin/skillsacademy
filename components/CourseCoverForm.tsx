"use client";

import { useActionState, useState } from "react";
import { safeAction } from "@/lib/safeAction";

type State = { error?: string; success?: true } | undefined;

export default function CourseCoverForm({
  action,
  courseId,
  hasCover,
  version,
  estimatedTime,
}: {
  action: (prev: State, formData: FormData) => Promise<State>;
  courseId: string;
  hasCover: boolean;
  version: string;
  estimatedTime: string;
}) {
  // Controlled so a rejected upload doesn't wipe what was typed (React resets uncontrolled fields after every submit).
  const [estimate, setEstimate] = useState(estimatedTime);
  const [state, formAction, pending] = useActionState(
    safeAction(action, "Couldn't save — the connection dropped or the image was too large. Please try again."),
    undefined
  );
  return (
    <form action={formAction} className="grid gap-3 border-t border-gray-100 pt-5 mt-5">
      <input type="hidden" name="courseId" value={courseId} />
      <h3 className="text-sm font-semibold text-gray-900">Course page image &amp; time estimate</h3>
      <div className="flex items-center gap-4 flex-wrap">
        {hasCover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/courses/${courseId}/cover?v=${encodeURIComponent(version)}`} alt="Current cover" className="h-16 w-28 object-cover rounded-md border border-gray-200" />
        ) : (
          <span className="text-xs text-gray-400">No image yet — the page shows a coloured panel with the course emoji.</span>
        )}
        <input type="file" name="cover" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" className="text-xs text-gray-600" data-testid="cover-input" />
      </div>
      {hasCover && (
        <label className="text-xs text-gray-500 flex items-center gap-2">
          <input type="checkbox" name="remove_cover" /> Remove the current image
        </label>
      )}
      <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
        Estimated time <span className="font-normal text-gray-400">(optional, e.g. 3-4 weeks, 4-8 hours per week)</span>
        <input name="estimated_time" value={estimate} onChange={(e) => setEstimate(e.target.value)} maxLength={80} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
      </label>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-700">Saved.</p>}
      <div>
        <button type="submit" disabled={pending} className="rounded-md px-4 py-2 text-sm font-semibold border border-gray-300 hover:bg-gray-50">
          {pending ? "Saving…" : "Save image & estimate"}
        </button>
      </div>
    </form>
  );
}
