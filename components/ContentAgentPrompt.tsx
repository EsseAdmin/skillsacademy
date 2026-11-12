"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startContentAgent } from "@/lib/actions/contentAgent";
import { safeAction } from "@/lib/safeAction";
import PlanBuildProgress from "@/components/PlanBuildProgress";
import { KIND_ICON, KIND_LABEL } from "@/lib/moduleContent";

const EXAMPLES = [
  "For my Fire Safety course, make a PowerPoint on evacuation procedures with a Word exercise sheet, and a short SCORM quiz.",
  "Add a written lesson and a Word handout on giving feedback to the Management Basics course. Beginner level, friendly tone.",
  "Create a 5-minute video script and a PowerPoint on data protection for the GDPR course.",
];

export default function ContentAgentPrompt({ slug, area, courses, remaining }: { slug: string; area: "admin" | "instructor"; courses: { id: string; title: string }[]; remaining: number }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [courseId, setCourseId] = useState("");
  const [state, action, pending] = useActionState(safeAction(startContentAgent.bind(null, slug), "The agent couldn't plan that — the connection dropped. Please try again."), undefined);
  const result = state?.result;
  const started = !!result && result.jobCount > 0;

  return (
    <div className="grid gap-5">
      <form action={action} className="app-card p-6 grid gap-4">
        <div>
          <h2 className="font-semibold text-gray-900">What should the agent create?</h2>
          <p className="text-sm text-gray-500 mt-1">
            Say which course and which modules you want — and the format of each (PowerPoint, Word handout, exercise sheet, SCORM lesson with a quiz, video script, written lesson). The agent writes complete, ready-to-use content and adds it to the course.
          </p>
        </div>
        <textarea
          name="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={5}
          maxLength={2000}
          required
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          placeholder={EXAMPLES[0]}
          data-testid="agent-prompt"
        />
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((e, i) => (
            <button key={i} type="button" onClick={() => setPrompt(e)} className="text-xs rounded-full border border-gray-300 px-3 py-1 text-gray-600 hover:bg-gray-50 text-left">
              Example {i + 1}
            </button>
          ))}
        </div>
        <label className="text-xs font-semibold text-gray-600 grid gap-1.5 md:max-w-md">
          Course <span className="font-normal text-gray-400">(optional — or just name it in your request)</span>
          <select name="courseId" value={courseId} onChange={(e) => setCourseId(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-normal" data-testid="agent-course">
            <option value="">Work it out from my request</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        {state?.error && <p className="text-sm text-red-600" data-testid="agent-error">{state.error}</p>}
        <div className="flex items-center gap-3 flex-wrap">
          <button type="submit" disabled={pending || !prompt.trim() || remaining <= 0} className="app-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold disabled:opacity-60" data-testid="agent-submit">
            {pending ? "Planning…" : "✨ Create modules"}
          </button>
          <span className="text-xs text-gray-400">Each generated file counts as one AI action ({remaining} left this month).</span>
        </div>
      </form>

      {result?.question && (
        <div className="app-card p-5 border-amber-300 bg-amber-50" data-testid="agent-question">
          <div className="text-sm font-semibold text-amber-900 mb-1">The agent needs a little more</div>
          <p className="text-sm text-amber-900">{result.question}</p>
          {result.notes.map((n, i) => (
            <p key={i} className="text-xs text-amber-800 mt-1">{n}</p>
          ))}
        </div>
      )}

      {started && result && (
        <div className="app-card p-5" data-testid="agent-summary">
          <div className="text-sm font-semibold text-gray-900 mb-2">
            Creating {result.jobCount} module{result.jobCount === 1 ? "" : "s"} in “{result.courseTitle}”
          </div>
          <ul className="grid gap-1 text-sm text-gray-700 mb-3">
            {result.planned.map((m, i) => (
              <li key={i}>
                <span aria-hidden="true">{KIND_ICON[m.kind]}</span> {m.title} <span className="text-gray-400">({KIND_LABEL[m.kind]}{m.exercises ? " + Word exercise sheet" : ""}{m.kind === "VIDEO" && !m.url ? " — script to record" : ""})</span>
              </li>
            ))}
          </ul>
          {result.notes.map((n, i) => (
            <p key={i} className="text-xs text-amber-700 mb-1">{n}</p>
          ))}
          <p className="text-xs text-gray-500">Keep this page open while each file is written — they appear in the course as they finish.</p>
        </div>
      )}
      {started && result && <PlanBuildProgress key={result.courseId + String(result.jobCount) + result.planned.map((p) => p.title).join("|")} slug={slug} onFinished={() => router.refresh()} />}
      {started && result && (
        <div>
          <Link href={`/a/${slug}/${area}/courses/${result.courseId}`} className="text-sm app-link font-semibold" data-testid="agent-view-course">
            Open the course →
          </Link>
        </div>
      )}
    </div>
  );
}
