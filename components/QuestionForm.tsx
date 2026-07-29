"use client";

import { useState } from "react";

type QType = "single_choice" | "multiple_choice" | "true_false" | "short_answer";

export default function QuestionForm({
  action,
  quizId,
  moduleId,
}: {
  action: (formData: FormData) => void | Promise<void>;
  quizId: string;
  moduleId: string;
}) {
  const [type, setType] = useState<QType>("single_choice");
  const [optionCount, setOptionCount] = useState(4);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="quizId" value={quizId} />
      <input type="hidden" name="moduleId" value={moduleId} />

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["single_choice", "◉ Single choice"],
            ["multiple_choice", "☑ Multiple choice"],
            ["true_false", "✓✗ True / False"],
            ["short_answer", "✎ Short answer"],
          ] as const
        ).map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${
              type === t ? "app-btn-primary border-transparent" : "border-gray-300 text-gray-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <input type="hidden" name="question_type" value={type} />

      <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
        Question
        <input name="prompt" required className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="Type the question…" />
      </label>

      <label className="text-xs font-semibold text-gray-600 grid gap-1.5 w-32">
        Points
        <input name="points" type="number" min="1" defaultValue={1} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
      </label>

      {(type === "single_choice" || type === "multiple_choice") && (
        <div className="grid gap-2">
          <div className="text-xs font-semibold text-gray-600">
            Options — tick the {type === "single_choice" ? "correct one" : "correct ones"}
          </div>
          {Array.from({ length: optionCount }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type={type === "single_choice" ? "radio" : "checkbox"}
                name="option_correct"
                value={i}
                className="shrink-0"
              />
              <input
                name="option_text"
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder={`Option ${i + 1}`}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => setOptionCount((n) => n + 1)}
            className="text-xs font-semibold app-link self-start"
          >
            + Add another option
          </button>
        </div>
      )}

      {type === "true_false" && (
        <label className="text-xs font-semibold text-gray-600 grid gap-1.5 w-40">
          Correct answer
          <select name="true_false_answer" className="rounded-md border border-gray-300 px-3 py-2 text-sm">
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
        </label>
      )}

      {type === "short_answer" && (
        <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
          Accepted answers (comma-separated — matched case-insensitively)
          <input name="short_answer_accepted" className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="e.g. photosynthesis, photo synthesis" />
        </label>
      )}

      <div>
        <button type="submit" className="app-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold">
          Add Question
        </button>
      </div>
    </form>
  );
}
