"use client";

import { useState } from "react";

export default function ModuleForm({
  action,
  courseId,
}: {
  action: (formData: FormData) => void | Promise<void>;
  courseId?: string;
}) {
  const [contentType, setContentType] = useState<"TEXT" | "URL" | "FILE" | "LIVE_SESSION">("TEXT");
  const [provider, setProvider] = useState<"zoom" | "microsoft">("zoom");

  return (
    <form action={action} className="grid gap-4">
      {courseId && <input type="hidden" name="courseId" value={courseId} />}
      <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
        Module title
        <input name="title" required className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="e.g. Fire Safety Basics" />
      </label>
      <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
        Short description
        <input name="description" className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="What does this module cover?" />
      </label>

      <div className="text-xs font-semibold text-gray-600">Content type</div>
      <div className="flex flex-wrap gap-2">
        {(["TEXT", "URL", "FILE", "LIVE_SESSION"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setContentType(t)}
            className={`px-4 py-2 rounded-md text-xs font-semibold border ${
              contentType === t ? "app-btn-primary border-transparent" : "border-gray-300 text-gray-600"
            }`}
          >
            {t === "TEXT" && "📝 Text"}
            {t === "URL" && "🔗 URL Link"}
            {t === "FILE" && "📎 File (Word / PDF / PPT)"}
            {t === "LIVE_SESSION" && "🎥 Live Session"}
          </button>
        ))}
      </div>
      <input type="hidden" name="content_type" value={contentType} />

      {contentType === "TEXT" && (
        <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
          Text content
          <textarea name="content_text" rows={5} className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="Write the module content here…" />
        </label>
      )}
      {contentType === "URL" && (
        <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
          Link URL
          <input name="content_url" type="url" className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="https://example.com/resource" />
        </label>
      )}
      {contentType === "FILE" && (
        <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
          Upload file (Word, PDF, PowerPoint, or any document)
          <input
            name="file"
            type="file"
            accept=".doc,.docx,.pdf,.ppt,.pptx,.txt,.xls,.xlsx"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs"
          />
        </label>
      )}
      {contentType === "LIVE_SESSION" && (
        <div className="grid gap-3">
          <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
            Host this session from your own Zoom or Microsoft Teams account, then paste the meeting link below —
            enrolled learners will see it as a join link on the course page.
          </p>
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
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              placeholder={provider === "zoom" ? "https://zoom.us/j/…" : "https://teams.microsoft.com/l/meetup-join/…"}
            />
          </label>
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Passcode (optional)
            <input name="live_password" className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="Only if your meeting needs one" />
          </label>
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Start date &amp; time (optional)
            <input name="live_start_time" type="datetime-local" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Duration (minutes)
            <input name="live_duration_minutes" type="number" min="15" step="5" defaultValue={60} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </label>
        </div>
      )}

      <div>
        <button type="submit" className="app-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed">
          Create Module
        </button>
      </div>
    </form>
  );
}
