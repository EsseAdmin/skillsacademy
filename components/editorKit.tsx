"use client";

import { useRef, useState, type ReactNode } from "react";

// Building blocks shared by the two page editors: the super admin's Home page editor
// (components/HomeEditor.tsx) and an academy admin's Page designer
// (components/AcademyDesigner.tsx).

export const input = "rounded-md border border-gray-300 px-3 py-2 text-sm w-full bg-white";
export const btn = "rounded-md px-3 py-1.5 text-xs font-semibold border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed";
export const btnPrimary = "app-btn-primary rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50";


export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
      <span>
        {label} {hint && <span className="font-normal text-gray-400">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function Txt({ label, hint, value, onChange, rows, placeholder, testid }: { label: string; hint?: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string; testid?: string }) {
  return (
    <Field label={label} hint={hint}>
      {rows ? (
        <textarea className={input} rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} data-testid={testid} />
      ) : (
        <input className={input} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} data-testid={testid} />
      )}
    </Field>
  );
}

export function Pick<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <Field label={label}>
      <select className={input} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Items<T>({ title, items, onChange, blank, max, render }: { title: string; items: T[]; onChange: (next: T[]) => void; blank: () => T; max: number; render: (item: T, set: (patch: Partial<T>) => void, i: number) => ReactNode }) {
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="grid gap-3">
      <div className="text-xs font-semibold text-gray-600">{title}</div>
      {items.map((it, i) => (
        <div key={i} className="border border-gray-200 rounded-lg p-3 grid gap-2 bg-gray-50/60" data-testid="item-row">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-gray-400">#{i + 1}</span>
            <span className="flex gap-1">
              <button type="button" className={btn} onClick={() => move(i, -1)} disabled={i === 0} title="Move up">↑</button>
              <button type="button" className={btn} onClick={() => move(i, 1)} disabled={i === items.length - 1} title="Move down">↓</button>
              <button type="button" className={btn} onClick={() => onChange(items.filter((_, k) => k !== i))} title="Remove">✕</button>
            </span>
          </div>
          {render(it, (patch) => onChange(items.map((x, k) => (k === i ? { ...x, ...patch } : x))), i)}
        </div>
      ))}
      <div>
        <button type="button" className={btn} disabled={items.length >= max} onClick={() => onChange([...items, blank()])}>
          + Add
        </button>
      </div>
    </div>
  );
}


type UploadResult = { ok: true; key: string } | { ok: false; error: string };

export function ImagePicker({ value, alt, onChange, onAlt, aiEnabled, heading, urlFor, upload, draw, drawHint }: {
  value: string | null;
  alt: string;
  onChange: (k: string | null) => void;
  onAlt: (a: string) => void;
  aiEnabled: boolean;
  heading: string;
  urlFor: (key: string) => string;
  upload: (fd: FormData) => Promise<UploadResult>;
  draw: (subject: string, heading: string) => Promise<UploadResult>;
  drawHint?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"" | "upload" | "draw">("");
  const [error, setError] = useState("");
  const [drawing, setDrawing] = useState(false);
  const [subject, setSubject] = useState("");

  async function doUpload(file: File | undefined) {
    if (!file) return;
    setBusy("upload");
    setError("");
    const fd = new FormData();
    fd.set("image", file);
    try {
      const r = await upload(fd);
      if (r.ok) onChange(r.key);
      else setError(r.error);
    } catch {
      setError("The upload didn't go through — please try again.");
    }
    setBusy("");
    if (fileRef.current) fileRef.current.value = "";
  }
  async function doDraw() {
    setBusy("draw");
    setError("");
    try {
      const r = await draw(subject, heading);
      if (r.ok) {
        onChange(r.key);
        setDrawing(false);
      } else setError(r.error);
    } catch {
      setError("The picture didn't come back — please try again.");
    }
    setBusy("");
  }

  return (
    <div className="grid gap-2" data-testid="image-picker">
      <div className="text-xs font-semibold text-gray-600">Picture</div>
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={urlFor(value)} alt={alt} className="w-full max-w-sm rounded-md border border-gray-200" data-testid="image-thumb" />
      ) : (
        <div className="text-xs text-gray-400 border border-dashed border-gray-300 rounded-md p-4 max-w-sm">No picture yet.</div>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} disabled={busy !== ""} onClick={() => fileRef.current?.click()}>
          {busy === "upload" ? "Uploading…" : value ? "Replace picture" : "Upload picture"}
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" className="hidden" data-testid="image-file" onChange={(e) => void doUpload(e.target.files?.[0])} />
        {aiEnabled && (
          <button type="button" className={btn} disabled={busy !== ""} onClick={() => setDrawing((d) => !d)} data-testid="ai-draw-toggle">
            ✨ Draw with AI
          </button>
        )}
        {value && (
          <button type="button" className={btn} onClick={() => onChange(null)}>
            Remove
          </button>
        )}
      </div>
      {drawing && (
        <div className="grid gap-2 border border-gray-200 rounded-lg p-3 bg-gray-50/60">
          <Txt label="Describe the picture" hint={drawHint ?? "(people at work, in your site's colours)"} value={subject} onChange={setSubject} rows={2} placeholder="e.g. A trainer showing a group of colleagues a laptop in a bright office" testid="ai-draw-subject" />
          <div>
            <button type="button" className={btnPrimary} disabled={busy !== "" || subject.trim().length < 4} onClick={() => void doDraw()} data-testid="ai-draw-go">
              {busy === "draw" ? "Drawing… (about 20 seconds)" : "Draw it"}
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-red-600" data-testid="image-error">{error}</p>}
      {value && <Txt label="Describe the picture for screen readers" hint="(alt text)" value={alt} onChange={onAlt} />}
    </div>
  );
}

const NOT_WORDING = new Set(["id", "type", "anchor", "image", "visible", "tone", "columns", "imageSide", "listStyle", "align", "height", "showStats", "bg", "grouping", "date", "url"]);
function flatten(v: unknown, path = "", out: Record<string, string> = {}): Record<string, string> {
  if (typeof v === "string") out[path] = v;
  else if (Array.isArray(v)) v.forEach((x, i) => flatten(x, `${path}[${i + 1}]`, out));
  else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v)) if (!NOT_WORDING.has(k) && !/href/i.test(k)) flatten(x, path ? `${path}.${k}` : k, out);
  return out;
}

/** "Rewrite this section with AI": asks, shows the changed wording, and only applies it when accepted. */
export function AiRewrite<S extends object>({ section, rewrite, onApply }: { section: S; rewrite: (sectionJson: string, ask: string) => Promise<{ ok: true; section: S } | { ok: false; error: string }>; onApply: (s: S) => void }) {
  const [ask, setAsk] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState<S | null>(null);

  async function go() {
    setBusy(true);
    setError("");
    setProposal(null);
    try {
      const r = await rewrite(JSON.stringify(section), ask);
      if (r.ok) setProposal(r.section);
      else setError(r.error);
    } catch {
      setError("That didn't come back — please try again.");
    }
    setBusy(false);
  }
  const before = flatten(section);
  const after = proposal ? flatten(proposal) : {};
  const changes = Object.keys({ ...before, ...after }).filter((k) => before[k] !== after[k]);

  return (
    <details className="border border-gray-200 rounded-lg p-3 bg-white" data-testid="ai-rewrite">
      <summary className="text-xs font-semibold cursor-pointer select-none">✨ Rewrite this section with AI</summary>
      <div className="grid gap-2 mt-3">
        <Txt label="How should the wording change?" value={ask} onChange={setAsk} rows={2} placeholder="e.g. Make it warmer and shorter, aimed at charities" testid="ai-rewrite-ask" />
        <div>
          <button type="button" className={btnPrimary} disabled={busy || ask.trim().length < 4} onClick={() => void go()} data-testid="ai-rewrite-go">
            {busy ? "Writing…" : "Suggest new wording"}
          </button>
        </div>
        {error && <p className="text-xs text-red-600" data-testid="ai-rewrite-error">{error}</p>}
        {proposal && (
          <div className="border border-emerald-200 bg-emerald-50 rounded-lg p-3 grid gap-2" data-testid="ai-rewrite-proposal">
            <div className="text-xs font-semibold text-emerald-900">Proposed wording — nothing changes until you accept.</div>
            {changes.length === 0 && <p className="text-xs text-emerald-900">The AI suggested no changes.</p>}
            <ul className="grid gap-1.5 max-h-72 overflow-auto">
              {changes.map((k) => (
                <li key={k} className="text-xs">
                  <span className="text-gray-500">{k}</span>
                  {before[k] && <div className="text-gray-500 line-through whitespace-pre-wrap">{before[k]}</div>}
                  {after[k] && <div className="text-gray-900 whitespace-pre-wrap">{after[k]}</div>}
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button type="button" className={btnPrimary} onClick={() => { onApply(proposal); setProposal(null); setAsk(""); }} data-testid="ai-rewrite-accept">
                Use this wording
              </button>
              <button type="button" className={btn} onClick={() => setProposal(null)}>
                Discard
              </button>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

export function LinksEditor({ title, links, onChange }: { title: string; links: { label: string; href: string }[]; onChange: (l: { label: string; href: string }[]) => void }) {
  return (
    <Items title={title} items={links} max={8} blank={() => ({ label: "Link", href: "/" })} onChange={onChange} render={(it, up) => (
      <div className="grid md:grid-cols-2 gap-2"><Txt label="Text" value={it.label} onChange={(v) => up({ label: v })} /><Txt label="Goes to" hint="(/page, #section or https://…)" value={it.href} onChange={(v) => up({ href: v })} /></div>
    )} />
  );
}

