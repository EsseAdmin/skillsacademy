"use client";

import { useActionState, useState } from "react";
import { requestAgentDraft } from "@/lib/actions/contentAgent";
import { safeAction } from "@/lib/safeAction";

export interface AgentModuleOption {
  id: string;
  title: string;
  kind: "TEXT" | "SLIDES" | "DOCUMENT";
}
export interface AgentCourseOption {
  id: string;
  title: string;
}

const ACTIONS = [
  { value: "IMPROVE_TEXT", label: "Improve a written module", hint: "Rewrite, simplify, shorten, expand or translate an existing text module." },
  { value: "REBUILD_FILE", label: "Rebuild a PowerPoint / Word module", hint: "Produce a revised version of an existing deck or handout from your instruction." },
  { value: "NEW_MODULE", label: "Draft a new module", hint: "Write a brand-new written lesson, PowerPoint deck or Word handout." },
] as const;

const KIND_LABEL = { TEXT: "Written lesson", SLIDES: "PowerPoint deck", DOCUMENT: "Word handout" } as const;
const KIND_TAG = { TEXT: "text", SLIDES: "PowerPoint", DOCUMENT: "Word" } as const;

export default function AgentRequestForm({
  slug,
  modules,
  courses,
  remaining,
}: {
  slug: string;
  modules: AgentModuleOption[];
  courses: AgentCourseOption[];
  remaining: number;
}) {
  const bound = safeAction(requestAgentDraft.bind(null, slug), "That took too long or the connection dropped. Check the review list below in case the draft arrived, then try a shorter request.");
  const [state, formAction, pending] = useActionState(bound, undefined);
  const [action, setAction] = useState<(typeof ACTIONS)[number]["value"]>("IMPROVE_TEXT");

  const usable = modules.filter((m) => (action === "IMPROVE_TEXT" ? m.kind === "TEXT" : m.kind !== "TEXT"));
  const current = ACTIONS.find((a) => a.value === action)!;
  const outOfActions = remaining <= 0;

  return (
    <form action={formAction} className="app-card p-6 grid gap-4">
      <div>
        <h2 className="font-semibold text-gray-900 mb-1">Ask the content agent</h2>
        <p className="text-xs text-gray-500 leading-relaxed">
          The agent writes a <strong>draft</strong> for you to review. Nothing in your academy changes until a person presses
          Approve below, and each request uses 1 of your AI actions this month.
        </p>
      </div>

      <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
        What would you like?
        <select name="action" value={action} onChange={(e) => setAction(e.target.value as typeof action)} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-normal">
          {ACTIONS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
        <span className="font-normal text-gray-500">{current.hint}</span>
      </label>

      {action !== "NEW_MODULE" ? (
        <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
          Which module?
          <select name="moduleId" required className="rounded-md border border-gray-300 px-3 py-2 text-sm font-normal" defaultValue="">
            <option value="" disabled>
              {usable.length ? "Choose a module…" : "No matching modules available to you"}
            </option>
            {usable.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title} ({KIND_TAG[m.kind]})
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Title of the new module
            <input name="title" required maxLength={140} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-normal" placeholder="e.g. Manual handling basics" />
          </label>
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Format
            <select name="kind" className="rounded-md border border-gray-300 px-3 py-2 text-sm font-normal" defaultValue="SLIDES">
              {(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5 md:col-span-2">
            Add it to a course (optional)
            <select name="courseId" className="rounded-md border border-gray-300 px-3 py-2 text-sm font-normal" defaultValue="">
              <option value="">Just save it to the modules library</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <span className="font-normal text-gray-500">It is only added after you approve the draft.</span>
          </label>
        </div>
      )}

      <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
        {action === "NEW_MODULE" ? "What should it cover?" : "What should change?"}
        <textarea
          name="instruction"
          required
          rows={4}
          maxLength={1500}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm font-normal"
          placeholder={
            action === "NEW_MODULE"
              ? "e.g. Cover the safe way to lift and carry, with two workplace examples, for warehouse staff."
              : "e.g. Make it simpler for new starters, add a worked example, and keep it under 400 words."
          }
        />
      </label>

      {outOfActions && <p className="text-sm text-amber-700">No AI actions left this month — the agent is paused until the allowance resets.</p>}
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.draftId && !pending && <p className="text-sm text-green-700">Draft ready — review it below.</p>}

      <div>
        <button type="submit" disabled={pending || outOfActions} className="app-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold disabled:opacity-60">
          {pending ? "Writing a draft… this can take up to a minute" : "✨ Write a draft"}
        </button>
      </div>
    </form>
  );
}
