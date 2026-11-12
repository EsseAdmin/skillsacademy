"use client";

import { useEffect, useRef, useState } from "react";
import {
  saveHomeDraft,
  publishHome,
  discardHomeDraft,
  resetHomeDraftToOriginal,
  restoreHomeVersion,
  uploadHomeImage,
  aiRewriteSection,
  aiDrawHomeImage,
} from "@/lib/actions/marketingPage";
import {
  SECTION_TYPES,
  SECTION_LABEL,
  SECTION_HINT,
  TOKEN_HELP,
  TONES,
  blankSection,
  imageUrl,
  newSectionId,
  type HomePage,
  type Section,
  type SectionType,
} from "@/lib/marketingPage";

// The super admin's editor for the SkillsAcademy.ai home page: a list of sections on the
// left (reorder, hide, copy, delete, add), the selected section's fields on the right, and
// a preview of the saved draft. Nothing is public until Publish.

import { input, btn, btnPrimary, Field, Txt, Pick, Items, ImagePicker, AiRewrite, LinksEditor } from "@/components/editorKit";

function Pic({ theme, ...rest }: { value: string | null; alt: string; onChange: (k: string | null) => void; onAlt: (a: string) => void; aiEnabled: boolean; heading: string; theme: HomePage["theme"] }) {
  return <ImagePicker {...rest} urlFor={imageUrl} upload={uploadHomeImage} draw={(subject, heading) => aiDrawHomeImage(subject, heading, theme.navy, theme.gold)} />;
}

const TONE_LABEL = { light: "Light (off-white)", dark: "Dark (navy)", deep: "Deep (darker navy)" } as const;

const HEADING_HINT = "New line = line break. *Word* in asterisks = gold italic.";

function SectionFields({ s, set, aiEnabled, theme }: { s: Section; set: (patch: Partial<Section>) => void; aiEnabled: boolean; theme: HomePage["theme"] }) {
  const p = (patch: Record<string, unknown>) => set(patch as Partial<Section>);
  const toneField = (value: string) => (
    <Pick label="Background" value={value as "light"} options={TONES.map((t) => ({ value: t, label: TONE_LABEL[t] }))} onChange={(v) => p({ tone: v })} />
  );
  switch (s.type) {
    case "hero":
      return (
        <>
          <Txt label="Small label above the headline" value={s.tag} onChange={(v) => p({ tag: v })} />
          <Txt label="Headline" hint={HEADING_HINT} value={s.headline} rows={3} onChange={(v) => p({ headline: v })} testid="f-headline" />
          <Txt label="Intro paragraph" value={s.sub} rows={4} onChange={(v) => p({ sub: v })} />
          <div className="grid md:grid-cols-2 gap-3">
            <Txt label="Main button" hint="(blank = automatic trial wording)" value={s.primaryLabel} onChange={(v) => p({ primaryLabel: v })} />
            <Txt label="Main button goes to" value={s.primaryHref} onChange={(v) => p({ primaryHref: v })} />
            <Txt label="Second button" hint="(blank = none)" value={s.secondaryLabel} onChange={(v) => p({ secondaryLabel: v })} />
            <Txt label="Second button goes to" value={s.secondaryHref} onChange={(v) => p({ secondaryHref: v })} placeholder="#pricing" />
          </div>
          <Pic value={s.image} alt={s.imageAlt} onChange={(k) => p({ image: k })} onAlt={(a) => p({ imageAlt: a })} aiEnabled={aiEnabled} heading={s.headline} theme={theme} />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={s.showStats} onChange={(e) => p({ showStats: e.target.checked })} /> Show the statistics panel <span className="text-xs text-gray-400">(hidden when the hero has a picture)</span>
          </label>
          {s.showStats && (
            <Items title="Statistics (text in {braces} is filled in automatically — see the placeholder list below)" items={s.stats} max={4} blank={() => ({ value: "0", label: "Label" })} onChange={(stats) => p({ stats })} render={(it, up) => (
              <div className="grid md:grid-cols-2 gap-2">
                <Txt label="Number" value={it.value} onChange={(v) => up({ value: v })} />
                <Txt label="Label" value={it.label} onChange={(v) => up({ label: v })} />
              </div>
            )} />
          )}
        </>
      );
    case "cards":
      return (
        <>
          <div className="grid md:grid-cols-2 gap-3">{toneField(s.tone)}<Pick label="Cards per row" value={String(s.columns) as "3"} options={[{ value: "2", label: "2" }, { value: "3", label: "3" }, { value: "4", label: "4" }]} onChange={(v) => p({ columns: Number(v) })} /></div>
          <Txt label="Small label" value={s.tag} onChange={(v) => p({ tag: v })} />
          <Txt label="Heading" hint={HEADING_HINT} value={s.title} rows={2} onChange={(v) => p({ title: v })} testid="f-title" />
          <Txt label="Intro" value={s.sub} rows={3} onChange={(v) => p({ sub: v })} />
          <Items title="Cards" items={s.items} max={12} blank={() => ({ icon: "✨", title: "New card", text: "" })} onChange={(items) => p({ items })} render={(it, up) => (
            <>
              <div className="grid grid-cols-[5rem_1fr] gap-2"><Txt label="Icon" value={it.icon} onChange={(v) => up({ icon: v })} /><Txt label="Title" value={it.title} onChange={(v) => up({ title: v })} /></div>
              <Txt label="Text" value={it.text} rows={2} onChange={(v) => up({ text: v })} />
            </>
          )} />
        </>
      );
    case "split":
      return (
        <>
          <div className="grid md:grid-cols-2 gap-3">{toneField(s.tone)}<Pick label="Picture / list side" value={s.imageSide} options={[{ value: "right", label: "Right" }, { value: "left", label: "Left" }]} onChange={(v) => p({ imageSide: v })} /></div>
          <Txt label="Small label" value={s.tag} onChange={(v) => p({ tag: v })} />
          <Txt label="Heading" hint={HEADING_HINT} value={s.title} rows={2} onChange={(v) => p({ title: v })} testid="f-title" />
          <Txt label="Intro" value={s.sub} rows={3} onChange={(v) => p({ sub: v })} />
          <Txt label="More text" hint="(blank line = new paragraph)" value={s.body} rows={3} onChange={(v) => p({ body: v })} />
          <Pic value={s.image} alt={s.imageAlt} onChange={(k) => p({ image: k })} onAlt={(a) => p({ imageAlt: a })} aiEnabled={aiEnabled} heading={s.title} theme={theme} />
          <div className="grid md:grid-cols-2 gap-3">
            <Txt label="List title" value={s.listTitle} onChange={(v) => p({ listTitle: v })} />
            <Pick label="List style" value={s.listStyle} options={[{ value: "numbered", label: "Numbered" }, { value: "bullets", label: "Bullets" }, { value: "none", label: "No list" }]} onChange={(v) => p({ listStyle: v })} />
          </div>
          {s.listStyle !== "none" && (
            <Items title="List" items={s.list} max={12} blank={() => ({ title: "New point", text: "" })} onChange={(list) => p({ list })} render={(it, up) => (
              <div className="grid md:grid-cols-2 gap-2"><Txt label="Bold part" value={it.title} onChange={(v) => up({ title: v })} /><Txt label="Rest of the line" value={it.text} onChange={(v) => up({ text: v })} /></div>
            )} />
          )}
        </>
      );
    case "columns":
      return (
        <>
          {toneField(s.tone)}
          <Txt label="Small label" value={s.tag} onChange={(v) => p({ tag: v })} />
          <Txt label="Heading" hint={HEADING_HINT} value={s.title} rows={2} onChange={(v) => p({ title: v })} testid="f-title" />
          <Txt label="Intro" value={s.sub} rows={3} onChange={(v) => p({ sub: v })} />
          <Items title="Columns" items={s.items} max={4} blank={() => ({ icon: "🏢", title: "New column", bullets: ["A point"] })} onChange={(items) => p({ items })} render={(it, up) => (
            <>
              <div className="grid grid-cols-[5rem_1fr] gap-2"><Txt label="Icon" value={it.icon} onChange={(v) => up({ icon: v })} /><Txt label="Title" value={it.title} onChange={(v) => up({ title: v })} /></div>
              <Txt label="Bullet points" hint="(one per line)" value={it.bullets.join("\n")} rows={5} onChange={(v) => up({ bullets: v.split("\n") })} />
            </>
          )} />
        </>
      );
    case "steps":
      return (
        <>
          {toneField(s.tone)}
          <Txt label="Small label" value={s.tag} onChange={(v) => p({ tag: v })} />
          <Txt label="Heading" hint={HEADING_HINT} value={s.title} rows={2} onChange={(v) => p({ title: v })} testid="f-title" />
          <Items title="Steps (numbered automatically)" items={s.items} max={8} blank={() => ({ title: "New step", text: "" })} onChange={(items) => p({ items })} render={(it, up) => (
            <>
              <Txt label="Title" value={it.title} onChange={(v) => up({ title: v })} />
              <Txt label="Text" value={it.text} rows={2} onChange={(v) => up({ text: v })} />
            </>
          )} />
        </>
      );
    case "pricing":
      return (
        <>
          <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-md p-3">The plans, prices and features are shown automatically from <b>Subscription Plans</b>. Only the wording around them is edited here.</p>
          <Txt label="Small label" value={s.tag} onChange={(v) => p({ tag: v })} />
          <Txt label="Heading" hint={HEADING_HINT} value={s.title} rows={2} onChange={(v) => p({ title: v })} testid="f-title" />
          <Txt label="Intro" value={s.sub} rows={4} onChange={(v) => p({ sub: v })} />
          <div className="grid md:grid-cols-2 gap-3"><Txt label="Plan button" value={s.ctaLabel} onChange={(v) => p({ ctaLabel: v })} /><Txt label="Badge on the middle plan" hint="(blank = none)" value={s.badge} onChange={(v) => p({ badge: v })} /></div>
        </>
      );
    case "banner":
      return (
        <>
          <Pic value={s.image} alt={s.imageAlt} onChange={(k) => p({ image: k })} onAlt={(a) => p({ imageAlt: a })} aiEnabled={aiEnabled} heading={s.title} theme={theme} />
          <Pick label="Height" value={s.height} options={[{ value: "short", label: "Short" }, { value: "medium", label: "Medium" }, { value: "tall", label: "Tall" }]} onChange={(v) => p({ height: v })} />
          <Txt label="Headline over the picture" hint={HEADING_HINT} value={s.title} rows={2} onChange={(v) => p({ title: v })} testid="f-title" />
          <Txt label="Text" value={s.text} rows={3} onChange={(v) => p({ text: v })} />
          <div className="grid md:grid-cols-2 gap-3"><Txt label="Button" hint="(blank = none)" value={s.buttonLabel} onChange={(v) => p({ buttonLabel: v })} /><Txt label="Button goes to" value={s.buttonHref} onChange={(v) => p({ buttonHref: v })} /></div>
        </>
      );
    case "text":
      return (
        <>
          <div className="grid md:grid-cols-2 gap-3">{toneField(s.tone)}<Pick label="Alignment" value={s.align} options={[{ value: "left", label: "Left" }, { value: "center", label: "Centred" }]} onChange={(v) => p({ align: v })} /></div>
          <Txt label="Small label" value={s.tag} onChange={(v) => p({ tag: v })} />
          <Txt label="Heading" hint={HEADING_HINT} value={s.title} rows={2} onChange={(v) => p({ title: v })} testid="f-title" />
          <Txt label="Text" hint="(blank line = new paragraph)" value={s.body} rows={8} onChange={(v) => p({ body: v })} testid="f-body" />
        </>
      );
    case "cta":
      return (
        <>
          <Txt label="Small label" value={s.tag} onChange={(v) => p({ tag: v })} />
          <Txt label="Heading" hint={HEADING_HINT} value={s.title} rows={2} onChange={(v) => p({ title: v })} testid="f-title" />
          <Txt label="Text" value={s.text} rows={3} onChange={(v) => p({ text: v })} />
          <div className="grid md:grid-cols-2 gap-3"><Txt label="Button" value={s.buttonLabel} onChange={(v) => p({ buttonLabel: v })} /><Txt label="Button goes to" value={s.buttonHref} onChange={(v) => p({ buttonHref: v })} /></div>
        </>
      );
  }
}

function SiteSettings({ page, setPage }: { page: HomePage; setPage: (p: HomePage) => void }) {
  const nav = page.nav;
  const setNav = (patch: Partial<HomePage["nav"]>) => setPage({ ...page, nav: { ...nav, ...patch } });
  const colourField = (label: string, key: "navy" | "gold") => (
    <Field label={label}>
      <span className="flex gap-2">
        <input type="color" value={page.theme[key]} onChange={(e) => setPage({ ...page, theme: { ...page.theme, [key]: e.target.value } })} className="h-9 w-12 rounded border border-gray-300" data-testid={`theme-${key}`} />
        <input className={input} value={page.theme[key]} onChange={(e) => setPage({ ...page, theme: { ...page.theme, [key]: e.target.value } })} />
      </span>
    </Field>
  );
  return (
    <div className="grid gap-5" data-testid="site-settings">
      <div>
        <h3 className="font-semibold text-gray-900">Colours</h3>
        <p className="text-xs text-gray-500 mb-3">The main dark colour and the accent used across the page. Clear contrast matters: keep the accent bright on the dark colour.</p>
        <div className="grid md:grid-cols-2 gap-3">{colourField("Main (dark) colour", "navy")}{colourField("Accent colour", "gold")}</div>
        <button type="button" className={`${btn} mt-2`} onClick={() => setPage({ ...page, theme: { navy: "#0b1f3b", gold: "#fbcb07" } })}>Back to the original colours</button>
      </div>
      <div>
        <h3 className="font-semibold text-gray-900 mb-2">Top navigation</h3>
        <div className="grid md:grid-cols-3 gap-3">
          <Txt label="Logo — plain start" value={nav.logoBefore} onChange={(v) => setNav({ logoBefore: v })} />
          <Txt label="Logo — accent word" value={nav.logoAccent} onChange={(v) => setNav({ logoAccent: v })} />
          <Txt label="Logo — plain end" value={nav.logoAfter} onChange={(v) => setNav({ logoAfter: v })} />
          <Txt label="Log-in button" value={nav.loginLabel} onChange={(v) => setNav({ loginLabel: v })} />
          <Txt label="Main button" value={nav.ctaLabel} onChange={(v) => setNav({ ctaLabel: v })} />
        </div>
        <div className="mt-3"><LinksEditor title="Menu links" links={nav.links} onChange={(links) => setNav({ links })} /></div>
      </div>
      <div>
        <h3 className="font-semibold text-gray-900 mb-2">Footer</h3>
        <Txt label="Footer text" hint="({year} = this year)" value={page.footer.text} rows={2} onChange={(v) => setPage({ ...page, footer: { ...page.footer, text: v } })} />
        <div className="mt-3"><LinksEditor title="Footer links" links={page.footer.links} onChange={(links) => setPage({ ...page, footer: { ...page.footer, links } })} /></div>
      </div>
      <div>
        <h3 className="font-semibold text-gray-900 mb-2">Search engines</h3>
        <div className="grid gap-3">
          <Txt label="Page title" hint="(blank = platform default)" value={page.seo.title} onChange={(v) => setPage({ ...page, seo: { ...page.seo, title: v } })} />
          <Txt label="Description" value={page.seo.description} rows={2} onChange={(v) => setPage({ ...page, seo: { ...page.seo, description: v } })} />
        </div>
      </div>
    </div>
  );
}

function titleOf(s: Section): string {
  const t = "headline" in s ? s.headline : "title" in s ? s.title : "";
  return (t || "").replace(/\*/g, "").replace(/\s*\n\s*/g, " ").slice(0, 46) || "(no heading)";
}

export interface EditorVersion {
  id: string;
  publishedAt: string;
}

export default function HomeEditor({ initialPage, hasDraft: initialHasDraft, publishedAt, versions, aiEnabled, previewHref }: { initialPage: HomePage; hasDraft: boolean; publishedAt: string | null; versions: EditorVersion[]; aiEnabled: boolean; /** Where the preview page is served (the portal may be on a secret address). */ previewHref: string }) {
  const [page, setPageState] = useState<HomePage>(initialPage);
  const [dirty, setDirty] = useState(false);
  const [hasDraft, setHasDraft] = useState(initialHasDraft);
  const [live, setLive] = useState<string | null>(publishedAt);
  const [selected, setSelected] = useState<string>(initialPage.sections[0]?.id ?? "site");
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [previewKey, setPreviewKey] = useState(1);
  const [busy, setBusy] = useState<"" | "save" | "publish" | "other">("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [restoreId, setRestoreId] = useState("");
  const moreRef = useRef<HTMLDetailsElement>(null);

  const setPage = (p: HomePage) => {
    setPageState(p);
    setDirty(true);
    setMsg(null);
  };
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const sel = page.sections.find((s) => s.id === selected);
  const patch = (id: string, p: Partial<Section>) => setPage({ ...page, sections: page.sections.map((s) => (s.id === id ? ({ ...s, ...p } as Section) : s)) });
  const replaceSection = (next: Section) => setPage({ ...page, sections: page.sections.map((s) => (s.id === next.id ? next : s)) });
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= page.sections.length) return;
    const next = [...page.sections];
    [next[i], next[j]] = [next[j], next[i]];
    setPage({ ...page, sections: next });
  };
  const duplicate = (i: number) => {
    const copy = { ...structuredClone(page.sections[i]), id: newSectionId(), anchor: "" } as Section;
    const next = [...page.sections];
    next.splice(i + 1, 0, copy);
    setPage({ ...page, sections: next });
    setSelected(copy.id);
  };
  const remove = (i: number) => {
    if (!window.confirm(`Delete the section “${titleOf(page.sections[i])}”?`)) return;
    const next = page.sections.filter((_, k) => k !== i);
    setPage({ ...page, sections: next });
    setSelected(next[Math.min(i, next.length - 1)]?.id ?? "site");
  };
  const add = (type: SectionType) => {
    const s = blankSection(type);
    const at = sel ? page.sections.findIndex((x) => x.id === sel.id) + 1 : page.sections.length;
    const next = [...page.sections];
    next.splice(at, 0, s);
    setPage({ ...page, sections: next });
    setSelected(s.id);
    setAdding(false);
  };

  function applyResult(r: { ok: true; page: HomePage; savedAt: string } | { ok: false; error: string }, okText: string, opts: { draft: boolean }) {
    if (!r.ok) {
      setMsg({ kind: "err", text: r.error });
      return false;
    }
    setPageState(r.page);
    setDirty(false);
    setHasDraft(opts.draft);
    setPreviewKey((k) => k + 1);
    if (!r.page.sections.some((s) => s.id === selected) && selected !== "site") setSelected(r.page.sections[0]?.id ?? "site");
    setMsg({ kind: "ok", text: okText });
    return true;
  }
  async function guarded(kind: "save" | "publish" | "other", fn: () => Promise<void>) {
    moreRef.current?.removeAttribute("open");
    setBusy(kind);
    try {
      await fn();
    } catch {
      setMsg({ kind: "err", text: "That didn't go through — check your connection and try again." });
    }
    setBusy("");
  }
  const save = () => guarded("save", async () => void applyResult(await saveHomeDraft(JSON.stringify(page)), "Draft saved. The public page hasn't changed.", { draft: true }));
  const publish = () => {
    if (!window.confirm("Publish this version to skillsacademy.ai now? Visitors will see it straight away.")) return;
    return guarded("publish", async () => {
      if (applyResult(await publishHome(JSON.stringify(page)), "Published — the public home page is updated.", { draft: false })) setLive(new Date().toISOString());
    });
  };
  const discard = () => {
    if (!window.confirm("Throw away your unpublished changes and go back to the live page?")) return;
    return guarded("other", async () => void applyResult(await discardHomeDraft(), "Changes discarded — this is the live page again.", { draft: false }));
  };
  const original = () => {
    if (!window.confirm("Replace the draft with the original built-in design? (It only goes live when you publish.)")) return;
    return guarded("other", async () => void applyResult(await resetHomeDraftToOriginal(), "The original design is loaded as your draft.", { draft: true }));
  };
  const restore = () => {
    if (!restoreId) return;
    if (!window.confirm("Load that earlier version as your draft? (It only goes live when you publish.)")) return;
    return guarded("other", async () => void applyResult(await restoreHomeVersion(restoreId), "Earlier version loaded as your draft.", { draft: true }));
  };
  async function showPreview() {
    setTab("preview");
    if (dirty) await save();
  }

  const status = dirty ? "Unsaved changes" : hasDraft ? "Draft saved — not yet public" : "Matches the live page";

  return (
    <div className="grid gap-4" data-testid="home-editor">
      <div className="app-card p-4 flex flex-wrap items-center gap-3 sticky top-0 z-10">
        <span className={`text-xs px-3 py-1.5 rounded-full font-semibold ${dirty ? "bg-amber-100 text-amber-800" : hasDraft ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`} data-testid="editor-status">
          {status}
        </span>
        {live && <span className="text-xs text-gray-400">Live version published {new Date(live).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
        <span className="flex-1" />
        <div className="inline-flex rounded-md border border-gray-300 overflow-hidden text-xs font-semibold">
          <button type="button" className={`px-3 py-1.5 ${tab === "edit" ? "bg-gray-900 text-white" : "bg-white"}`} onClick={() => setTab("edit")} data-testid="tab-edit">Edit</button>
          <button type="button" className={`px-3 py-1.5 ${tab === "preview" ? "bg-gray-900 text-white" : "bg-white"}`} onClick={() => void showPreview()} data-testid="tab-preview">Preview</button>
        </div>
        <button type="button" className={btn} onClick={() => void save()} disabled={busy !== "" || !dirty} data-testid="save-draft">{busy === "save" ? "Saving…" : "Save draft"}</button>
        <button type="button" className={btnPrimary} onClick={() => void publish()} disabled={busy !== ""} data-testid="publish">{busy === "publish" ? "Publishing…" : "Publish"}</button>
        <details className="relative" ref={moreRef}>
          <summary className={`${btn} cursor-pointer list-none`}>More ▾</summary>
          <div className="absolute right-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg p-3 grid gap-2 z-20">
            <button type="button" className={btn} onClick={() => void discard()} disabled={busy !== "" || (!hasDraft && !dirty)} data-testid="discard-draft">Discard changes (back to live page)</button>
            <button type="button" className={btn} onClick={() => void original()} disabled={busy !== ""} data-testid="reset-original">Load the original design</button>
            <div className="grid gap-1.5 pt-2 border-t border-gray-100">
              <span className="text-[11px] font-semibold text-gray-500">Earlier published versions</span>
              <select className={input} value={restoreId} onChange={(e) => setRestoreId(e.target.value)} data-testid="version-select">
                <option value="">{versions.length ? "Choose a version…" : "None yet"}</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {new Date(v.publishedAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </option>
                ))}
              </select>
              <button type="button" className={btn} onClick={() => void restore()} disabled={busy !== "" || !restoreId} data-testid="restore-version">Load as draft</button>
            </div>
          </div>
        </details>
      </div>

      {msg && (
        <p className={`text-sm rounded-md px-4 py-2.5 ${msg.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`} data-testid="editor-message" role="status">
          {msg.text}
        </p>
      )}

      {tab === "preview" ? (
        <div className="app-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="inline-flex rounded-md border border-gray-300 overflow-hidden text-xs font-semibold">
              <button type="button" className={`px-3 py-1.5 ${device === "desktop" ? "bg-gray-900 text-white" : "bg-white"}`} onClick={() => setDevice("desktop")}>Desktop</button>
              <button type="button" className={`px-3 py-1.5 ${device === "phone" ? "bg-gray-900 text-white" : "bg-white"}`} onClick={() => setDevice("phone")}>Phone</button>
            </div>
            <span className="text-xs text-gray-400">This is your saved draft — not the public page.</span>
            <span className="flex-1" />
            <a href={previewHref} target="_blank" rel="noreferrer" className="text-xs app-link font-semibold">Open in a new tab ↗</a>
            <a href="/" target="_blank" rel="noreferrer" className="text-xs app-link font-semibold">View the live page ↗</a>
          </div>
          <div className="flex justify-center bg-gray-100 rounded-lg p-3">
            <iframe key={previewKey} title="Home page preview" src={`${previewHref}?v=${previewKey}`} className="bg-white rounded-md border border-gray-200" style={{ width: device === "phone" ? 390 : "100%", height: "75vh" }} data-testid="preview-frame" />
          </div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[19rem_1fr] gap-4 items-start">
          <div className="app-card p-3 grid gap-2" data-testid="section-list">
            <button type="button" onClick={() => setSelected("site")} className={`text-left rounded-md px-3 py-2 text-sm font-semibold border ${selected === "site" ? "border-gray-900 bg-gray-50" : "border-gray-200"}`} data-testid="select-site">
              🎨 Colours, menu &amp; footer
            </button>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mt-2">Sections, top to bottom</div>
            {page.sections.map((s, i) => (
              <div key={s.id} className={`rounded-md border ${selected === s.id ? "border-gray-900 bg-gray-50" : "border-gray-200"}`} data-testid="section-row">
                <button type="button" onClick={() => setSelected(s.id)} className="w-full text-left px-3 pt-2 pb-1">
                  <div className="text-[11px] text-gray-400">{SECTION_LABEL[s.type]}{!s.visible && " · hidden"}</div>
                  <div className={`text-sm font-semibold ${s.visible ? "text-gray-900" : "text-gray-400 line-through"}`}>{titleOf(s)}</div>
                </button>
                <div className="flex gap-1 px-2 pb-2">
                  <button type="button" className={btn} onClick={() => move(i, -1)} disabled={i === 0} title="Move up">↑</button>
                  <button type="button" className={btn} onClick={() => move(i, 1)} disabled={i === page.sections.length - 1} title="Move down">↓</button>
                  <button type="button" className={btn} onClick={() => patch(s.id, { visible: !s.visible })} title="Show or hide">{s.visible ? "Hide" : "Show"}</button>
                  <button type="button" className={btn} onClick={() => duplicate(i)} title="Duplicate">Copy</button>
                  <button type="button" className={btn} onClick={() => remove(i)} title="Delete" data-testid="delete-section">✕</button>
                </div>
              </div>
            ))}
            <div className="pt-2">
              <button type="button" className={btnPrimary} onClick={() => setAdding((a) => !a)} disabled={page.sections.length >= 30} data-testid="add-section">+ Add a section</button>
              {adding && (
                <div className="grid gap-1.5 mt-2" data-testid="add-menu">
                  {SECTION_TYPES.map((t) => (
                    <button key={t} type="button" onClick={() => add(t)} className="text-left rounded-md border border-gray-200 px-3 py-2 hover:bg-gray-50" data-testid={`add-${t}`}>
                      <div className="text-sm font-semibold">{SECTION_LABEL[t]}</div>
                      <div className="text-[11px] text-gray-500">{SECTION_HINT[t]}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="app-card p-5 grid gap-4" data-testid="section-form">
            {selected === "site" || !sel ? (
              <SiteSettings page={page} setPage={setPage} />
            ) : (
              <>
                <div>
                  <h2 className="font-semibold text-gray-900">{SECTION_LABEL[sel.type]}</h2>
                  <p className="text-xs text-gray-500">{SECTION_HINT[sel.type]}</p>
                </div>
                <SectionFields s={sel} set={(p) => patch(sel.id, p)} aiEnabled={aiEnabled} theme={page.theme} />
                <Txt label="Link name for this section" hint="(so menu links like #pricing can jump here; letters, digits and dashes)" value={sel.anchor} onChange={(v) => patch(sel.id, { anchor: v })} />
                {aiEnabled && <AiRewrite key={sel.id} section={sel} rewrite={aiRewriteSection} onApply={replaceSection} />}
                <details className="text-xs text-gray-500">
                  <summary className="cursor-pointer select-none font-semibold">Placeholders you can type in any text</summary>
                  <ul className="mt-2 grid gap-1">
                    {TOKEN_HELP.map((t) => (
                      <li key={t.token}><code className="bg-gray-100 rounded px-1">{t.token}</code> — {t.meaning}</li>
                    ))}
                  </ul>
                </details>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
