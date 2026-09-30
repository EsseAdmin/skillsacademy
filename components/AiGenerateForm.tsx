"use client";

import { useActionState, useState } from "react";
import { generateAcademyUpdatePlan, applyAcademyUpdatePlan } from "@/lib/actions/aiAcademy";

export default function AiGenerateForm({ slug }: { slug: string }) {
  const boundGenerate = generateAcademyUpdatePlan.bind(null, slug);
  const boundApply = applyAcademyUpdatePlan.bind(null, slug);
  const [genState, genAction, genPending] = useActionState(boundGenerate, undefined);
  const [applyState, applyAction, applyPending] = useActionState(boundApply, undefined);
  const [prompt, setPrompt] = useState("");

  const plan = genState?.plan;

  return (
    <div className="grid gap-6 max-w-2xl">
      <div className="app-card p-6">
        <h2 className="font-semibold text-gray-900 mb-1">Describe what you&apos;d like</h2>
        <p className="text-xs text-gray-500 mb-4 leading-relaxed">
          Describe a colour theme and/or a course you&apos;d like to add, and we&apos;ll draft it for you to review.
          Nothing is added to your academy until you approve it below — this never deletes or changes anything you
          already have.
        </p>
        <form action={genAction} className="grid gap-3">
          <textarea
            name="prompt"
            required
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="e.g. A calm, professional look in teal and charcoal, plus a beginner course on workplace first aid with 4 modules."
          />
          {genState?.error && <p className="text-sm text-red-600">{genState.error}</p>}
          <div>
            <button type="submit" disabled={genPending} className="app-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold">
              {genPending ? "Generating…" : "✨ Generate"}
            </button>
          </div>
        </form>
      </div>

      {plan && (
        <div className="app-card p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Preview</h2>

          <div className="flex items-center gap-2 mb-4">
            {[plan.template.primary_color, plan.template.secondary_color, plan.template.accent_color].map((c, i) => (
              <div key={i} className="w-6 h-6 rounded-full border border-gray-200" style={{ background: c }} />
            ))}
            <span className="text-sm font-semibold text-gray-900">{plan.template.name}</span>
          </div>

          <div className="mb-4">
            <div className="text-sm font-bold text-gray-900">{plan.heroHeadline}</div>
            <div className="text-xs text-gray-500 mt-0.5">{plan.heroTagline}</div>
            <p className="text-xs text-gray-500 mt-2 leading-relaxed">{plan.aboutText}</p>
          </div>

          {plan.homepageBlocks.length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-semibold text-gray-600 mb-1.5">Homepage sections</div>
              <ul className="text-xs text-gray-500 grid gap-1">
                {plan.homepageBlocks.map((b, i) => (
                  <li key={i}>
                    <span className="font-medium text-gray-700">{b.title}</span> ({b.block_type === "NEWS" ? "News" : "Text"})
                  </li>
                ))}
              </ul>
            </div>
          )}

          {plan.courses.length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-semibold text-gray-600 mb-1.5">Starter courses</div>
              <ul className="text-xs text-gray-500 grid gap-2">
                {plan.courses.map((c, i) => (
                  <li key={i}>
                    <span className="font-medium text-gray-700">{c.title}</span> — {c.modules.length} module{c.modules.length === 1 ? "" : "s"}:{" "}
                    {c.modules.map((m) => m.title).join(", ")}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <form action={applyAction} className="grid gap-3 pt-2 border-t border-gray-100">
            <input type="hidden" name="plan" value={JSON.stringify(plan)} />
            <label className="text-xs font-semibold text-gray-600 flex items-center gap-2 mt-3">
              <input type="checkbox" name="switchTemplate" defaultChecked />
              Also switch my academy to this colour theme
            </label>
            {applyState?.error && <p className="text-sm text-red-600">{applyState.error}</p>}
            {applyState?.success && (
              <p className="text-sm text-emerald-700">
                Added {applyState.courseCount ?? 0} course(s) and {applyState.blockCount ?? 0} homepage section(s) — head to
                Courses, Branding, or Academy Site to keep customising.
              </p>
            )}
            <div>
              <button type="submit" disabled={applyPending} className="app-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold">
                {applyPending ? "Adding…" : "Add to my academy"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
