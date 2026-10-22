"use client";

import { useActionState } from "react";
import { safeAction } from "@/lib/safeAction";

type State = { error?: string; success?: true } | undefined;

export default function ModuleImageForm({
  action,
  moduleId,
  hasImage,
  version,
}: {
  action: (prev: State, formData: FormData) => Promise<State>;
  moduleId: string;
  hasImage: boolean;
  version: string;
}) {
  const [state, formAction, pending] = useActionState(
    safeAction(action, "Couldn't save — the connection dropped or the image was too large. Please try again."),
    undefined
  );
  return (
    <form action={formAction} className="grid gap-2 mt-4 pt-4 border-t border-gray-100">
      <input type="hidden" name="moduleId" value={moduleId} />
      <div className="text-xs font-semibold text-gray-600">Module picture</div>
      <div className="flex items-center gap-3 flex-wrap">
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/modules/${moduleId}/image?v=${encodeURIComponent(version)}`} alt="Current module picture" className="h-14 w-24 object-cover rounded-md border border-gray-200" />
        ) : (
          <span className="text-xs text-gray-400">Using the default picture matched to the title.</span>
        )}
        <input type="file" name="image" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" className="text-xs text-gray-600" data-testid="module-image-input" />
      </div>
      {hasImage && (
        <label className="text-xs text-gray-500 flex items-center gap-2">
          <input type="checkbox" name="remove_image" /> Go back to the default picture
        </label>
      )}
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-700">Saved.</p>}
      <div>
        <button type="submit" disabled={pending} className="rounded-md px-4 py-2 text-xs font-semibold border border-gray-300 hover:bg-gray-50">
          {pending ? "Saving…" : "Save picture"}
        </button>
      </div>
    </form>
  );
}
