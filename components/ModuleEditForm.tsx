"use client";

import { useState } from "react";
import type { ModuleRow } from "@/lib/queries";

function toLocalDateTimeValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ModuleEditForm({
  action,
  mod,
}: {
  action: (formData: FormData) => void | Promise<void>;
  mod: ModuleRow;
}) {
  const [provider, setProvider] = useState<"zoom" | "microsoft">(mod.live_provider || "zoom");

  return (
    <form action={action} className="grid gap-4 mt-4 pt-4 border-t border-gray-100">
      <input type="hidden" name="moduleId" value={mod.id} />
      <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
        Module title
        <input
          name="title"
          required
          defaultValue={mod.title}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
        Short description
        <input
          name="description"
          defaultValue={mod.description}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </label>

      {mod.content_type === "TEXT" && (
        <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
          Text content
          <textarea
            name="content_text"
            rows={5}
            defaultValue={mod.content_text || ""}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
      )}
      {mod.content_type === "URL" && (
        <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
          Link URL
          <input
            name="content_url"
            type="url"
            defaultValue={mod.content_url || ""}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
      )}
      {mod.content_type === "FILE" && (
        <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
          Replace file (leave blank to keep the current file{mod.file_name ? `: ${mod.file_name}` : ""})
          <input
            name="file"
            type="file"
            accept=".doc,.docx,.pdf,.ppt,.pptx,.txt,.xls,.xlsx"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs"
          />
        </label>
      )}
      {mod.content_type === "LIVE_SESSION" && (
        <div className="grid gap-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setProvider("zoom")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${
                provider === "zoom" ? "app-btn-primary border-transparent" : "border-gray-300 text-gray-600"
              }`}
            >
              🔵 Zoom
            </button>
            <button
              type="button"
              onClick={() => setProvider("microsoft")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${
                provider === "microsoft" ? "app-btn-primary border-transparent" : "border-gray-300 text-gray-600"
              }`}
            >
              🟣 Microsoft Teams
            </button>
          </div>
          <input type="hidden" name="live_provider" value={provider} />
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Meeting link
            <input
              name="live_join_url"
              type="url"
              required
              defaultValue={mod.live_join_url || ""}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              placeholder={provider === "zoom" ? "https://zoom.us/j/…" : "https://teams.microsoft.com/l/meetup-join/…"}
            />
          </label>
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Passcode (optional)
            <input
              name="live_password"
              defaultValue={mod.live_password || ""}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Start date &amp; time (optional)
            <input
              name="live_start_time"
              type="datetime-local"
              defaultValue={toLocalDateTimeValue(mod.live_start_time)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Duration (minutes)
            <input
              name="live_duration_minutes"
              type="number"
              min="15"
              step="5"
              defaultValue={mod.live_duration_minutes ?? 60}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
      )}
      {mod.content_type === "QUIZ" && (
        <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
          Use “Manage quiz questions” above to edit the quiz itself — this form only updates the title and
          description.
        </p>
      )}
      {mod.content_type === "SCORM" && (
        <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
          The SCORM package file can&apos;t be replaced here — delete this module and upload a new SCORM package to
          change it. This form only updates the title and description.
        </p>
      )}

      <div>
        <button type="submit" className="app-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold">
          Save changes
        </button>
      </div>
    </form>
  );
}
