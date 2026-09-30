"use client";

import { useEffect, useRef } from "react";

// A real (if pragmatic) SCORM 1.2 / SCORM 2004 runtime shim. SCORM content
// looks for a `window.API` (1.2) or `window.API_1484_11` (2004) object on
// an ancestor window and calls its methods *synchronously* — so we keep a
// live cmi model in memory here and only persist to the server on
// Commit/Finish (and periodically), which is exactly how a real LMS runtime
// behaves. The iframe is same-origin (served from our own /api/scorm/...
// route), so the content's own `findAPI` walk (`while (!win.API) win =
// win.parent`) finds the object we attach to this page's `window`, no
// postMessage plumbing needed.
//
// The API is attached in an effect that runs immediately after the iframe
// is committed to the DOM — well before the iframe's own network fetch for
// its HTML/JS completes and its scripts start looking for the API, so there
// is no real race in practice despite the iframe rendering unconditionally.
export default function ScormPlayer({
  packageId,
  courseId,
  launchUrl,
  version,
  studentId,
  studentName,
  initialSuspendData,
}: {
  packageId: string;
  courseId: string;
  launchUrl: string;
  version: "1.2" | "2004";
  studentId: string;
  studentName: string;
  initialSuspendData: string;
}) {
  const cmiRef = useRef<Record<string, string>>({
    "cmi.core.student_id": studentId,
    "cmi.core.student_name": studentName,
    "cmi.core.lesson_status": "incomplete",
    "cmi.core.entry": "ab-initio",
    "cmi.core.credit": "credit",
    "cmi.core.lesson_mode": "normal",
    "cmi.core.score.raw": "",
    "cmi.core.score.min": "0",
    "cmi.core.score.max": "100",
    "cmi.core.session_time": "00:00:00",
    "cmi.core.exit": "",
    "cmi.suspend_data": initialSuspendData || "",
    "cmi.launch_data": "",
    "cmi.comments": "",
    "cmi.learner_id": studentId,
    "cmi.learner_name": studentName,
    "cmi.completion_status": "incomplete",
    "cmi.success_status": "unknown",
    "cmi.entry": "ab-initio",
    "cmi.credit": "credit",
    "cmi.mode": "normal",
    "cmi.score.raw": "",
    "cmi.score.min": "0",
    "cmi.score.max": "100",
    "cmi.score.scaled": "",
    "cmi.session_time": "PT0H0M0S",
    "cmi.exit": "",
    "cmi.location": "",
  });

  useEffect(() => {
    const cmi = cmiRef.current;

    function persist(finishing: boolean) {
      const scoreRaw = cmi["cmi.core.score.raw"] || cmi["cmi.score.raw"];
      fetch(`/api/scorm/attempts/${packageId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          lesson_status: cmi["cmi.core.lesson_status"] || null,
          completion_status: cmi["cmi.completion_status"] || null,
          success_status: cmi["cmi.success_status"] || null,
          score_raw: scoreRaw ? Number(scoreRaw) : null,
          suspend_data: cmi["cmi.suspend_data"] || null,
        }),
        keepalive: finishing,
      }).catch(() => {
        // Best-effort — content still works locally even if a save fails;
        // the next Commit/Finish call will retry with the latest state.
      });
    }

    const win = window as unknown as Record<string, unknown>;

    if (version === "1.2") {
      win.API = {
        LMSInitialize: () => "true",
        LMSFinish: () => {
          persist(true);
          return "true";
        },
        LMSGetValue: (key: string) => cmi[key] ?? "",
        LMSSetValue: (key: string, value: string) => {
          cmi[key] = value;
          return "true";
        },
        LMSCommit: () => {
          persist(false);
          return "true";
        },
        LMSGetLastError: () => "0",
        LMSGetErrorString: () => "No error",
        LMSGetDiagnostic: () => "",
      };
    } else {
      win.API_1484_11 = {
        Initialize: () => "true",
        Terminate: () => {
          persist(true);
          return "true";
        },
        GetValue: (key: string) => cmi[key] ?? "",
        SetValue: (key: string, value: string) => {
          cmi[key] = value;
          return "true";
        },
        Commit: () => {
          persist(false);
          return "true";
        },
        GetLastError: () => "0",
        GetErrorString: () => "No error",
        GetDiagnostic: () => "",
      };
    }

    // Periodic autosave in case the content never calls Commit on its own.
    const interval = setInterval(() => persist(false), 30000);
    return () => {
      clearInterval(interval);
      persist(true);
      delete win.API;
      delete win.API_1484_11;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <iframe
      src={launchUrl}
      title="SCORM content"
      className="w-full border border-gray-200 rounded-md"
      style={{ height: "75vh" }}
      allow="autoplay; fullscreen"
    />
  );
}
