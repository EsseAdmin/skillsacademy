"use client";

import { useActionState } from "react";
import { safeAction } from "@/lib/safeAction";

type State = { error?: string; success?: true } | undefined;

// "Design a picture with AI": asks the server to draw an illustration for a
// course or a module and use it as its picture. Its own small form, so it can
// sit next to (not inside) the upload form.
export default function AiPictureButton({
  action,
  fieldName,
  fieldValue,
  hasPicture,
  testId,
}: {
  action: (prev: State, formData: FormData) => Promise<State>;
  fieldName: "courseId" | "moduleId";
  fieldValue: string;
  hasPicture: boolean;
  testId: string;
}) {
  const [state, formAction, pending] = useActionState(safeAction(action, "Couldn't design a picture — the connection dropped. Please try again."), undefined);
  return (
    <form action={formAction} className="grid gap-1.5 mt-3">
      <input type="hidden" name={fieldName} value={fieldValue} />
      <div>
        <button type="submit" disabled={pending} data-testid={testId} className="rounded-md px-4 py-2 text-xs font-semibold border border-gray-300 hover:bg-gray-50 disabled:opacity-60">
          {pending ? "Designing… (up to 20 seconds)" : hasPicture ? "✨ Design a new picture with AI" : "✨ Design a picture with AI"}
        </button>
      </div>
      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
      {state?.success && <p className="text-xs text-emerald-700">New picture saved.</p>}
    </form>
  );
}
