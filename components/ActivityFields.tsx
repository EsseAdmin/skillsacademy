"use client";

import { useState } from "react";
import {
  LIMITS, readBook, readGlossary, readChoice, readLesson, readAssignment, readForum, readMedia,
  type ConfigType, type Chapter, type GlossaryTerm, type LessonPage,
} from "@/lib/activities";
import { DOCUMENT_ACCEPT } from "@/lib/uploads-shared";
import type { ModuleRow } from "@/lib/queries";

export interface FolderFileInfo { id: string; file_name: string; file_size: number }

const input = "rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900";
const label = "text-xs font-semibold text-gray-700 grid gap-1.5";
const fileInput = `${input} file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs`;
const smallBtn = "text-xs font-semibold rounded-md px-3 py-1.5 border border-gray-300 hover:bg-gray-50";

function toLocalDateTimeValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-gray-600 font-normal">{children}</p>;
}

export default function ActivityFields({ type, mod, folderFiles }: { type: ConfigType; mod?: ModuleRow; folderFiles?: FolderFileInfo[] }) {
  switch (type) {
    case "PAGE":
      return (
        <label className={label}>
          Page content
          <textarea name="content_text" rows={12} required defaultValue={mod?.content_text ?? ""} className={input} placeholder={"# A heading\n\nA paragraph with **bold**, *italic* and a [link](https://example.com).\n\n- A bullet\n- Another bullet"} />
          <Hint>Formatting: start a line with # for a heading, - for a bullet or 1. for a numbered item. Use **bold**, *italic* and [text](https://link).</Hint>
        </label>
      );
    case "BOOK":
      return <BookFields initial={mod ? readBook(mod.config_json) : []} />;
    case "GLOSSARY":
      return <GlossaryFields initial={mod ? readGlossary(mod.config_json) : []} />;
    case "LESSON":
      return <LessonFields initial={mod ? readLesson(mod.config_json) : []} />;
    case "CHOICE":
      return <ChoiceFields mod={mod} />;
    case "ASSIGNMENT": {
      const cfg = readAssignment(mod?.config_json ?? null);
      return (
        <div className="grid gap-4">
          <label className={label}>
            Instructions
            <textarea name="content_text" rows={7} required defaultValue={mod?.content_text ?? ""} className={input} placeholder="Describe what learners should hand in…" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>
              Due date (optional)
              <input name="due_at" type="datetime-local" defaultValue={toLocalDateTimeValue(cfg.dueAt)} className={input} />
              <Hint>Late hand-ins are still accepted and are marked late for you.</Hint>
            </label>
            <label className={label}>
              Maximum grade
              <input name="max_grade" type="number" min={1} max={1000} defaultValue={mod ? cfg.maxGrade : 100} className={input} />
            </label>
          </div>
          <fieldset className="grid gap-2 text-sm text-gray-800">
            <legend className="text-xs font-semibold text-gray-700 mb-1">Learners can hand in</legend>
            <label className="flex items-center gap-2"><input type="checkbox" name="allow_text" defaultChecked={cfg.allowText} /> Written text</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="allow_file" defaultChecked={cfg.allowFile} /> A file (up to 5MB)</label>
          </fieldset>
          <Hint>A learner&apos;s module is marked complete when they hand in. Grading is always done by you.</Hint>
        </div>
      );
    }
    case "FORUM": {
      const cfg = readForum(mod?.config_json ?? null);
      return (
        <label className={label}>
          Discussion prompt (optional)
          <textarea name="content_text" rows={5} defaultValue={cfg.prompt} className={input} placeholder="What should learners discuss?" />
          <Hint>A learner&apos;s module is marked complete once they post. You can hide any post.</Hint>
        </label>
      );
    }
    case "MEDIA": {
      const cfg = readMedia(mod?.config_json ?? null);
      return (
        <div className="grid gap-4">
          <label className={label}>
            Text
            <textarea name="content_text" rows={5} defaultValue={cfg.caption} className={input} placeholder="Introduce or explain the media…" />
          </label>
          <label className={label}>
            Upload an image, audio clip or short video (PNG, JPG, GIF, WebP, MP3, WAV, OGG, MP4, WebM — up to 5MB)
            <input name="file" type="file" accept="image/png,image/jpeg,image/gif,image/webp,audio/mpeg,audio/wav,audio/ogg,video/mp4,video/webm,.png,.jpg,.jpeg,.gif,.webp,.mp3,.wav,.ogg,.mp4,.webm" className={fileInput} />
            {mod?.file_name && <Hint>Current file: {mod.file_name}. Choose a new one to replace it.</Hint>}
          </label>
          {mod?.file_path && (
            <label className="text-xs font-semibold text-gray-700 flex items-center gap-2"><input type="checkbox" name="removeFile" /> Remove the current file</label>
          )}
          <label className={label}>
            …or a YouTube / Vimeo link
            <input name="content_url" type="url" defaultValue={mod?.content_url ?? ""} className={input} placeholder="https://www.youtube.com/watch?v=…" />
          </label>
        </div>
      );
    }
    case "FOLDER":
      return (
        <div className="grid gap-4">
          {folderFiles && folderFiles.length > 0 && (
            <fieldset className="grid gap-2 rounded-md border border-gray-200 p-3">
              <legend className="text-xs font-semibold text-gray-700 px-1">Files in this folder — tick to remove</legend>
              {folderFiles.map((f) => (
                <label key={f.id} className="flex items-center gap-2 text-sm text-gray-800">
                  <input type="checkbox" name="remove_file" value={f.id} /> {f.file_name} <span className="text-xs text-gray-500">({Math.max(1, Math.round(f.file_size / 1024))} KB)</span>
                </label>
              ))}
            </fieldset>
          )}
          <label className={label}>
            {folderFiles && folderFiles.length > 0 ? "Add more files" : "Choose files"}
            <input name="files" type="file" multiple accept={DOCUMENT_ACCEPT} className={fileInput} />
            <Hint>Up to 5MB in total per save. If you have more, save and then add the rest.</Hint>
          </label>
        </div>
      );
  }
}

// ---------- repeatable rows ----------
let uid = 0;
const nextKey = () => `k${++uid}`;

function BookFields({ initial }: { initial: Chapter[] }) {
  const [rows, setRows] = useState(() => (initial.length ? initial : [{ title: "", text: "" }]).map((c) => ({ ...c, key: nextKey() })));
  return (
    <div className="grid gap-4">
      {rows.map((r, i) => (
        <div key={r.key} className="rounded-md border border-gray-200 p-4 grid gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700">Chapter {i + 1}</span>
            {rows.length > 1 && <button type="button" className="text-xs text-red-700 hover:underline" onClick={() => setRows(rows.filter((x) => x.key !== r.key))}>Remove</button>}
          </div>
          <input name="chapter_title" defaultValue={r.title} placeholder="Chapter title" aria-label={`Chapter ${i + 1} title`} className={input} maxLength={LIMITS.title} />
          <textarea name="chapter_text" defaultValue={r.text} rows={6} placeholder="Chapter text (supports the same simple formatting as a Page)" aria-label={`Chapter ${i + 1} text`} className={input} />
        </div>
      ))}
      {rows.length < LIMITS.chapters && <button type="button" className={`${smallBtn} justify-self-start`} onClick={() => setRows([...rows, { title: "", text: "", key: nextKey() }])}>+ Add a chapter</button>}
    </div>
  );
}

function GlossaryFields({ initial }: { initial: GlossaryTerm[] }) {
  const [rows, setRows] = useState(() => (initial.length ? initial : [{ term: "", definition: "" }]).map((c) => ({ ...c, key: nextKey() })));
  return (
    <div className="grid gap-3">
      {rows.map((r, i) => (
        <div key={r.key} className="grid gap-2 rounded-md border border-gray-200 p-3 sm:grid-cols-[1fr_2fr_auto] sm:items-start">
          <input name="term" defaultValue={r.term} placeholder="Term" aria-label={`Term ${i + 1}`} className={input} maxLength={LIMITS.termLen} />
          <textarea name="definition" defaultValue={r.definition} rows={2} placeholder="Definition" aria-label={`Definition ${i + 1}`} className={input} />
          {rows.length > 1 ? <button type="button" className="text-xs text-red-700 hover:underline sm:pt-2" onClick={() => setRows(rows.filter((x) => x.key !== r.key))}>Remove</button> : <span />}
        </div>
      ))}
      {rows.length < LIMITS.glossaryTerms && <button type="button" className={`${smallBtn} justify-self-start`} onClick={() => setRows([...rows, { term: "", definition: "", key: nextKey() }])}>+ Add a term</button>}
      <Hint>Terms are shown alphabetically. Learners can search the list.</Hint>
    </div>
  );
}

function ChoiceFields({ mod }: { mod?: ModuleRow }) {
  const cfg = readChoice(mod?.config_json ?? null);
  const [rows, setRows] = useState(() => (cfg.options.length ? cfg.options : ["", ""]).map((o) => ({ o, key: nextKey() })));
  return (
    <div className="grid gap-4">
      <label className={label}>
        Question
        <input name="choice_question" required defaultValue={cfg.question} className={input} maxLength={LIMITS.questionLen} placeholder="Which topic should we cover next?" />
      </label>
      <div className="grid gap-2">
        <div className="text-xs font-semibold text-gray-700">Options</div>
        {rows.map((r, i) => (
          <div key={r.key} className="flex gap-2">
            <input name="choice_option" defaultValue={r.o} placeholder={`Option ${i + 1}`} aria-label={`Option ${i + 1}`} className={`${input} flex-1`} maxLength={LIMITS.optionLen} />
            {rows.length > 2 && <button type="button" className="text-xs text-red-700 hover:underline" onClick={() => setRows(rows.filter((x) => x.key !== r.key))}>Remove</button>}
          </div>
        ))}
        {rows.length < LIMITS.choiceOptions && <button type="button" className={`${smallBtn} justify-self-start`} onClick={() => setRows([...rows, { o: "", key: nextKey() }])}>+ Add an option</button>}
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-800"><input type="checkbox" name="show_results" defaultChecked={mod ? cfg.showResults : true} /> Show learners the results after they vote</label>
      <label className="flex items-center gap-2 text-sm text-gray-800"><input type="checkbox" name="allow_change" defaultChecked={cfg.allowChange} /> Let learners change their answer</label>
    </div>
  );
}

function LessonFields({ initial }: { initial: LessonPage[] }) {
  const blank: LessonPage = { title: "", text: "", question: null };
  const [rows, setRows] = useState(() => (initial.length ? initial : [blank]).map((p) => ({ ...p, key: nextKey() })));
  return (
    <div className="grid gap-4">
      {rows.map((r, i) => (
        <div key={r.key} className="rounded-md border border-gray-200 p-4 grid gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700">Page {i + 1}</span>
            {rows.length > 1 && <button type="button" className="text-xs text-red-700 hover:underline" onClick={() => setRows(rows.filter((x) => x.key !== r.key))}>Remove</button>}
          </div>
          <input name="lp_title" defaultValue={r.title} placeholder="Page title" aria-label={`Page ${i + 1} title`} className={input} maxLength={LIMITS.title} />
          <textarea name="lp_text" defaultValue={r.text} rows={5} placeholder="Page content" aria-label={`Page ${i + 1} content`} className={input} />
          <details className="rounded-md bg-gray-50 p-3" open={!!r.question}>
            <summary className="cursor-pointer text-xs font-semibold text-gray-800">Question on this page (optional)</summary>
            <div className="mt-3 grid gap-3">
              <input name="lp_question" defaultValue={r.question?.prompt ?? ""} placeholder="Question" aria-label={`Page ${i + 1} question`} className={input} maxLength={LIMITS.questionLen} />
              <textarea name="lp_options" defaultValue={r.question?.options.join("\n") ?? ""} rows={4} placeholder={"One answer per line\nParis\nLondon"} aria-label={`Page ${i + 1} answers`} className={input} />
              <label className={label}>
                Number of the correct answer (1 = first line)
                <input name="lp_correct" type="number" min={1} max={LIMITS.lessonOptions} defaultValue={r.question ? r.question.correct + 1 : 1} className={`${input} w-24`} />
              </label>
              <input name="lp_feedback_correct" defaultValue={r.question?.feedbackCorrect ?? ""} placeholder="Feedback when correct (optional)" aria-label={`Page ${i + 1} correct feedback`} className={input} />
              <input name="lp_feedback_wrong" defaultValue={r.question?.feedbackWrong ?? ""} placeholder="Feedback when wrong (optional)" aria-label={`Page ${i + 1} wrong feedback`} className={input} />
            </div>
          </details>
        </div>
      ))}
      {rows.length < LIMITS.lessonPages && <button type="button" className={`${smallBtn} justify-self-start`} onClick={() => setRows([...rows, { ...blank, key: nextKey() }])}>+ Add a page</button>}
      <Hint>Learners move through the pages in order. A page with a question must be answered correctly (they can retry) before they continue. The lesson completes when they finish the last page.</Hint>
    </div>
  );
}
