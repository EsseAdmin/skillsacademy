"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getPlanBuildProgress, runPlanBuildStep } from "@/lib/actions/aiAcademy";
import type { BuildProgress } from "@/lib/aiBuildJobs";

// Drives the queued AI module builds: each call to runPlanBuildStep builds one
// module in its own short request (so nothing hits Netlify's ~30s limit), and
// this component keeps asking until nothing is left. Safe to mount on several
// pages and to open in two tabs: the server hands each job to one caller only.
// `onFinished` lets the page refresh its server data when the last module lands.
export default function PlanBuildProgress({ slug, onFinished }: { slug: string; onFinished?: () => void }) {
  const [progress, setProgress] = useState<BuildProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const stopped = useRef(false);
  const busy = useRef(false);
  const [sawWork, setSawWork] = useState(false);
  const notified = useRef(false);

  const loop = useCallback(
    async (retry: boolean) => {
      if (busy.current) return;
      busy.current = true;
      setRunning(true);
      setNote(null);
      let first = retry;
      let errors = 0;
      while (!stopped.current) {
        try {
          const r = await runPlanBuildStep(slug, first);
          first = false;
          if (r.progress) {
            errors = 0;
            setProgress(r.progress);
            if (r.progress.pending === 0) break;
          } else if (++errors >= 3) {
            setNote("Building paused — your connection may have dropped. Press “Keep going” to continue.");
            break;
          }
        } catch {
          // A dropped request: the server reclaims the module after a minute.
          if (++errors >= 3) {
            setNote("Building paused — your connection may have dropped. Press “Keep going” to continue.");
            break;
          }
          await new Promise((res) => setTimeout(res, 2000));
        }
      }
      busy.current = false;
      setRunning(false);
    },
    [slug]
  );

  useEffect(() => {
    stopped.current = false;
    (async () => {
      try {
        const r = await getPlanBuildProgress(slug);
        if (r.progress) {
          setProgress(r.progress);
          if (r.progress.pending > 0) {
            setSawWork(true);
            void loop(false);
          }
        }
      } catch {
        /* nothing to show */
      }
    })();
    return () => {
      stopped.current = true;
    };
  }, [slug, loop]);

  useEffect(() => {
    if (progress && progress.total > 0 && progress.pending === 0 && sawWork && !notified.current) {
      notified.current = true;
      onFinished?.();
    }
  }, [progress, sawWork, onFinished]);

  if (!progress || progress.total === 0) return null;
  const finished = progress.pending === 0;
  // Old, fully finished batches stay hidden; only show live work, this session's result, or failures.
  if (finished && !sawWork && progress.failed === 0 && !running) return null;
  const pct = Math.round((progress.done / progress.total) * 100);

  return (
    <div className="app-card p-5 mb-6" data-testid="plan-build-progress">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h2 className="text-sm font-semibold text-gray-900">
          {finished ? "Your AI content is ready" : "Building your course content…"}
        </h2>
        <span className="text-xs text-gray-500">
          {progress.done} of {progress.total} module{progress.total === 1 ? "" : "s"}
        </span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      {!finished && (
        <p className="text-xs text-gray-500 mt-2">
          Each PowerPoint, Word or SCORM module takes a little while. You can keep this page open — or leave and come back; it carries on when you return.
        </p>
      )}
      {finished && (
        <p className="text-sm text-emerald-700 mt-2">
          Done — head to Courses to see what was added.
          {progress.fallbackCount > 0 && (
            <span className="block text-amber-700 mt-1">
              {progress.fallbackCount} item(s) couldn&apos;t be generated in time (or the monthly AI allowance ran out) and were added as text drafts — add their real content from the Modules page.
            </span>
          )}
        </p>
      )}
      {progress.failed > 0 && finished && (
        <p className="text-sm text-red-600 mt-2">
          {progress.failed} module(s) couldn&apos;t be built.{" "}
          <button type="button" onClick={() => void loop(true)} disabled={running} className="underline font-semibold">
            Try those again
          </button>
        </p>
      )}
      {note && (
        <p className="text-sm text-amber-700 mt-2">
          {note}{" "}
          <button type="button" onClick={() => void loop(false)} disabled={running} className="underline font-semibold">
            Keep going
          </button>
        </p>
      )}
    </div>
  );
}
