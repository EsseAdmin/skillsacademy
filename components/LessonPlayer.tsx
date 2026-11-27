"use client";

import { useState, useTransition } from "react";
import Markup from "@/components/Markup";
import { checkLessonAnswerAction, finishLessonAction } from "@/lib/actions/activityLearner";

interface Page { title: string; text: string; question: { prompt: string; options: string[] } | null }

// Steps through lesson pages. Answers are checked on the server (the answer
// key is never sent to the browser); a page with a question can't be passed
// until it's answered correctly.
export default function LessonPlayer({ slug, moduleId, pages, answered, alreadyDone }: { slug: string; moduleId: string; pages: Page[]; answered: number[]; alreadyDone: boolean }) {
  const [i, setI] = useState(0);
  const [passed, setPassed] = useState<Set<number>>(new Set(answered));
  const [choice, setChoice] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ correct: boolean; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(alreadyDone);
  const [pending, start] = useTransition();
  const p = pages[i];
  const last = i === pages.length - 1;
  const needsAnswer = !!p?.question && !passed.has(i);

  const go = (n: number) => {
    setI(n);
    setChoice(null);
    setFeedback(null);
    setError(null);
  };

  const check = () => {
    if (choice === null) return;
    setError(null);
    start(async () => {
      const r = await checkLessonAnswerAction(slug, moduleId, i, choice);
      if (!r.ok) return setError(r.error);
      setFeedback({ correct: r.correct, text: r.feedback || (r.correct ? "Correct!" : "Not quite — try again.") });
      if (r.correct) setPassed((s) => new Set(s).add(i));
    });
  };

  const finish = () => {
    setError(null);
    start(async () => {
      const r = await finishLessonAction(slug, moduleId);
      if (!r.ok) return setError(r.error);
      setDone(true);
    });
  };

  if (!p) return <p className="text-sm text-gray-700">This lesson has no pages yet.</p>;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-1 text-xs font-semibold text-gray-600">Page {i + 1} of {pages.length}</div>
      <h2 className="mb-4 text-xl font-bold text-gray-900">{p.title}</h2>
      <Markup text={p.text} />
      {p.question && (
        <fieldset className="mt-6 rounded-md bg-gray-50 p-4">
          <legend className="px-1 text-sm font-semibold text-gray-900">{p.question.prompt}</legend>
          <div className="mt-2 grid gap-2">
            {p.question.options.map((o, idx) => (
              <label key={idx} className="flex items-center gap-2 text-sm text-gray-900">
                <input type="radio" name="lesson-answer" checked={choice === idx} disabled={passed.has(i)} onChange={() => { setChoice(idx); setFeedback(null); }} /> {o}
              </label>
            ))}
          </div>
          {!passed.has(i) && <button type="button" disabled={choice === null || pending} onClick={check} className="app-btn-primary mt-3 rounded-md px-4 py-2 text-xs font-semibold disabled:opacity-50">Check answer</button>}
          {passed.has(i) && !feedback && <p className="mt-3 text-sm font-medium text-emerald-700">✓ Answered correctly</p>}
          {feedback && <p role="status" className={`mt-3 text-sm font-medium ${feedback.correct ? "text-emerald-700" : "text-red-700"}`}>{feedback.correct ? "✓ " : "✗ "}{feedback.text}</p>}
        </fieldset>
      )}
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      <div className="mt-6 flex items-center justify-between">
        <button type="button" disabled={i === 0} onClick={() => go(i - 1)} className="rounded-md border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-800 disabled:opacity-40">← Back</button>
        {!last ? (
          <button type="button" disabled={needsAnswer} onClick={() => go(i + 1)} className="app-btn-primary rounded-md px-4 py-2 text-xs font-semibold disabled:opacity-50">Next →</button>
        ) : done ? (
          <span className="text-sm font-semibold text-emerald-700">✓ Lesson complete</span>
        ) : (
          <button type="button" disabled={needsAnswer || pending} onClick={finish} className="app-btn-primary rounded-md px-4 py-2 text-xs font-semibold disabled:opacity-50">Finish lesson</button>
        )}
      </div>
    </div>
  );
}
