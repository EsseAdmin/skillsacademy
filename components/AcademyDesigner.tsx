"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  saveDesignDraft,
  publishDesign,
  discardDesignDraft,
  resetDesignToStart,
  restoreDesignVersion,
  unpublishDesign,
  uploadDesignImage,
  aiRewriteDesignSection,
  aiDrawDesignImage,
  type DesignSaveResult,
} from "@/lib/actions/academyPage";
import {
  ACADEMY_SECTION_TYPES,
  ACADEMY_SECTION_LABEL,
  ACADEMY_SECTION_HINT,
  ACADEMY_TOKEN_HELP,
  FONTS,
  FONT_KEYS,
  academyImageUrl,
  blankAcademySection,
  newSectionId,
  type AcademyPage,
  type AcademySection,
  type AcademySectionType,
} from "@/lib/academyPage";
import { TONES } from "@/lib/marketingPage";
import { input, btn, btnPrimary, Field, Txt, Pick, Items, ImagePicker, AiRewrite, LinksEditor } from "@/components/editorKit";

// The academy admin's Page designer: a list of sections on the left (reorder, hide, copy,
// delete, add), the selected section's fields on the right, a "Colours, fonts, menu & footer"
// panel, and a preview of the saved draft. Nothing is public until Publish.

const TONE_LABEL = { light: "Light (the page background)", dark: "Dark (your main colour)", deep: "Deeper (a darker main colour)" } as const;
const HEADING_HINT = "New line = line break. *Word* in asterisks = italic.";

export interface DesignerVersion {
  id: string;
  publishedAt: string;
}

function titleOf(s: AcademySection): string {
  const t = "headline" in s ? s.headline : "title" in s ? s.title : "";
  return (t || "").replace(/\*/g, "").replace(/\s*\n\s*/g, " ").slice(0, 46) || (s.type === "courses" ? "Your courses" : s.type === "journeys" ? "Your learning journeys" : "(no heading)");
}

function Colour({ label, value, fallback, onChange, testid, hint }: { label: string; value: string; fallback: string; onChange: (v: string) => void; testid: string; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <span className="flex gap-2 items-center">
        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 rounded border border-gray-300" data-testid={testid} />
        <input className={input} value={value} placeholder={`${fallback} (automatic)`} onChange={(e) => onChange(e.target.value.trim())} />
        {value && (
          <button type="button" className="text-xs app-link font-semibold whitespace-nowrap" onClick={() => onChange("")}>
            Reset
          </button>
        )}
      </span>
    </Field>
  );
}

interface Brand {
  primary: string;
  secondary: string;
  accent: string;
}

function SectionFields({ s, set, pic, slug }: { s: AcademySection; set: (patch: Partial<AcademySection>) => void; pic: (value: string | null, alt: string, heading: string, onChange: (k: string | null) => void, onAlt: (a: string) => void) => React.ReactNode; slug: string }) {
  const p = (patch: Record<string, unknown>) => set(patch as Partial<AcademySection>);
  const toneField = (value: string) => (
    <Pick label="Background" value={value as "light"} options={TONES.map((t) => ({ value: t, label: TONE_LABEL[t] }))} onChange={(v) => p({ tone: v })} />
  );
  switch (s.type) {
    case "hero":
      return (
        <>
          <Txt label="Small label above the headline" hint="(optional)" value={s.tag} onChange={(v) => p({ tag: v })} />
          <Txt label="Headline" hint={HEADING_HINT} value={s.headline} rows={3} onChange={(v) => p({ headline: v })} testid="f-headline" />
          <Txt label="Intro paragraph" value={s.sub} rows={4} onChange={(v) => p({ sub: v })} />
          <div className="grid md:grid-cols-2 gap-3">
            <Txt label="Main button" hint="(blank = “Create account”)" value={s.primaryLabel} onChange={(v) => p({ primaryLabel: v })} />
            <Txt label="Main button goes to" value={s.primaryHref} onChange={(v) => p({ primaryHref: v })} />
            <Txt label="Second button" hint="(blank = none)" value={s.secondaryLabel} onChange={(v) => p({ secondaryLabel: v })} />
            <Txt label="Second button goes to" value={s.secondaryHref} onChange={(v) => p({ secondaryHref: v })} placeholder="#courses" />
          </div>
          {pic(s.image, s.imageAlt, s.headline, (k) => p({ image: k }), (a) => p({ imageAlt: a }))}
        </>
      );
    case "text":
      return (
        <>
          <div className="grid md:grid-cols-2 gap-3">{toneField(s.tone)}<Pick label="Alignment" value={s.align} options={[{ value: "left", label: "Left" }, { value: "center", label: "Centred" }]} onChange={(v) => p({ align: v })} /></div>
          <Txt label="Small label" hint="(optional)" value={s.tag} onChange={(v) => p({ tag: v })} />
          <Txt label="Heading" hint={HEADING_HINT} value={s.title} rows={2} onChange={(v) => p({ title: v })} testid="f-title" />
          <Txt label="Text" hint="(blank line = new paragraph)" value={s.body} rows={8} onChange={(v) => p({ body: v })} testid="f-body" />
        </>
      );
    case "banner":
      return (
        <>
          {pic(s.image, s.imageAlt, s.title, (k) => p({ image: k }), (a) => p({ imageAlt: a }))}
          <Pick label="Height" value={s.height} options={[{ value: "short", label: "Short" }, { value: "medium", label: "Medium" }, { value: "tall", label: "Tall" }]} onChange={(v) => p({ height: v })} />
          <Txt label="Headline over the picture" hint={HEADING_HINT} value={s.title} rows={2} onChange={(v) => p({ title: v })} testid="f-title" />
          <Txt label="Text" value={s.text} rows={3} onChange={(v) => p({ text: v })} />
          <div className="grid md:grid-cols-2 gap-3"><Txt label="Button" hint="(blank = none)" value={s.buttonLabel} onChange={(v) => p({ buttonLabel: v })} /><Txt label="Button goes to" value={s.buttonHref} onChange={(v) => p({ buttonHref: v })} /></div>
        </>
      );
    case "video":
      return (
        <>
          <Txt label="Heading" value={s.title} rows={2} onChange={(v) => p({ title: v })} testid="f-title" />
          <Txt label="Video link" hint="(YouTube, Vimeo or a direct https:// video file)" value={s.url} onChange={(v) => p({ url: v })} placeholder="https://www.youtube.com/watch?v=…" testid="f-video-url" />
          <Txt label="Caption" hint="(optional)" value={s.caption} rows={2} onChange={(v) => p({ caption: v })} />
        </>
      );
    case "news":
      return (
        <>
          <div className="grid md:grid-cols-2 gap-3">
            <Txt label="Label" hint="(blank = “News”)" value={s.tag} onChange={(v) => p({ tag: v })} />
            <Field label="Date" hint="(blank = no date)">
              <input type="date" className={input} value={s.date} onChange={(e) => p({ date: e.target.value })} />
            </Field>
          </div>
          <Txt label="Headline" value={s.title} rows={2} onChange={(v) => p({ title: v })} testid="f-title" />
          <Txt label="Text" hint="(blank line = new paragraph)" value={s.body} rows={6} onChange={(v) => p({ body: v })} testid="f-body" />
          {pic(s.image, s.imageAlt, s.title, (k) => p({ image: k }), (a) => p({ imageAlt: a }))}
        </>
      );
    case "learn":
      return (
        <>
          <Txt label="Heading" value={s.title} onChange={(v) => p({ title: v })} testid="f-title" />
          <Txt label="Points" hint="(one per line, up to 12)" value={s.points.join("\n")} rows={8} onChange={(v) => p({ points: v.split("\n") })} testid="f-points" />
        </>
      );
    case "courses":
      return (
        <>
          <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-md p-3">
            Your published courses appear here automatically, as cards. Add, edit and publish courses under <Link className="app-link font-semibold" href={`/a/${slug}/admin/courses`}>Courses</Link>; the course types shown are set in <Link className="app-link font-semibold" href={`/a/${slug}/admin/settings`}>Settings</Link>.
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            <Pick label="Show courses" value={s.grouping} options={[{ value: "type", label: "Grouped by course type" }, { value: "all", label: "All together" }]} onChange={(v) => p({ grouping: v })} />
            <Pick label="Cards per row" value={String(s.columns) as "3"} options={[{ value: "2", label: "2" }, { value: "3", label: "3" }, { value: "4", label: "4" }]} onChange={(v) => p({ columns: Number(v) })} />
          </div>
          <Txt label="Heading" hint="(blank = automatic)" value={s.title} onChange={(v) => p({ title: v })} testid="f-title" />
          <Txt label="Intro" hint="(optional)" value={s.sub} rows={2} onChange={(v) => p({ sub: v })} />
        </>
      );
    case "journeys":
      return (
        <>
          <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-md p-3">
            Your published learning journeys appear here automatically as maps. Build and publish them under <Link className="app-link font-semibold" href={`/a/${slug}/admin/journeys`}>Learning Journeys</Link>. Nothing is shown here until you have one.
          </p>
          <Txt label="Small label above each journey" hint="(blank = automatic)" value={s.title} onChange={(v) => p({ title: v })} testid="f-title" />
          <Txt label="Sentence under a journey's title" hint="(used when a journey has no description of its own)" value={s.sub} rows={2} onChange={(v) => p({ sub: v })} />
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
          {pic(s.image, s.imageAlt, s.title, (k) => p({ image: k }), (a) => p({ imageAlt: a }))}
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

function LookSettings({ page, setPage, brand, slug }: { page: AcademyPage; setPage: (p: AcademyPage) => void; brand: Brand; slug: string }) {
  const th = page.theme;
  const setTheme = (patch: Partial<AcademyPage["theme"]>) => setPage({ ...page, theme: { ...th, ...patch } });
  const setHeader = (patch: Partial<AcademyPage["header"]>) => setPage({ ...page, header: { ...page.header, ...patch } });
  const setFooter = (patch: Partial<AcademyPage["footer"]>) => setPage({ ...page, footer: { ...page.footer, ...patch } });
  const fontOptions = FONT_KEYS.map((k) => ({ value: k, label: FONTS[k].label }));
  return (
    <div className="grid gap-5" data-testid="site-settings">
      <div>
        <h3 className="font-semibold text-gray-900">Colours</h3>
        <p className="text-xs text-gray-500 mb-3">
          Left blank, these follow your <Link className="app-link font-semibold" href={`/a/${slug}/admin/branding`}>Branding</Link> template. Pick your own to change this page only. Keep good contrast: text on the main colour is chosen automatically.
        </p>
        <div className="grid md:grid-cols-2 gap-3">
          <Colour label="Main colour" value={th.primary} fallback={brand.primary} onChange={(v) => setTheme({ primary: v })} testid="theme-primary" />
          <Colour label="Second colour" hint="(top of the hero gradient)" value={th.secondary} fallback={brand.secondary} onChange={(v) => setTheme({ secondary: v })} testid="theme-secondary" />
          <Colour label="Accent colour" hint="(buttons)" value={th.accent} fallback={brand.accent} onChange={(v) => setTheme({ accent: v })} testid="theme-accent" />
          <Colour label="Page background" value={th.background} fallback="#f6f7fb" onChange={(v) => setTheme({ background: v })} testid="theme-background" />
        </div>
      </div>
      <div>
        <h3 className="font-semibold text-gray-900 mb-2">Fonts</h3>
        <div className="grid md:grid-cols-2 gap-3">
          <Pick label="Headings" value={th.headingFont} options={fontOptions} onChange={(v) => setTheme({ headingFont: v })} />
          <Pick label="Body text" value={th.bodyFont} options={fontOptions} onChange={(v) => setTheme({ bodyFont: v })} />
        </div>
        <p className="text-xs text-gray-400 mt-2">These are fonts every device already has, so the page stays fast and private.</p>
      </div>
      <div>
        <h3 className="font-semibold text-gray-900 mb-2">Top menu</h3>
        <p className="text-xs text-gray-500 mb-3">Your logo and academy name come from <Link className="app-link font-semibold" href={`/a/${slug}/admin/site`}>Academy Site</Link>. “Create account” and “Sign in” are always shown.</p>
        <div className="grid md:grid-cols-3 gap-3">
          <Pick label="Style" value={page.header.style} options={[{ value: "brand", label: "Your main colour" }, { value: "light", label: "White" }]} onChange={(v) => setHeader({ style: v })} />
          <Txt label="Create-account link" hint="(blank = automatic)" value={page.header.registerLabel} onChange={(v) => setHeader({ registerLabel: v })} />
          <Txt label="Sign-in button" hint="(blank = automatic)" value={page.header.signInLabel} onChange={(v) => setHeader({ signInLabel: v })} />
        </div>
        <div className="mt-3"><LinksEditor title="Menu links" links={page.header.links} onChange={(links) => setHeader({ links })} /></div>
      </div>
      <div>
        <h3 className="font-semibold text-gray-900 mb-2">Footer</h3>
        <div className="grid md:grid-cols-2 gap-3">
          <Pick label="Style" value={page.footer.style} options={[{ value: "brand", label: "Your main colour" }, { value: "light", label: "White" }]} onChange={(v) => setFooter({ style: v })} />
          <Txt label="Footer text" hint="(blank = your academy name; {year} = this year)" value={page.footer.text} rows={2} onChange={(v) => setFooter({ text: v })} />
        </div>
        <div className="mt-3"><LinksEditor title="Footer links" links={page.footer.links} onChange={(links) => setFooter({ links })} /></div>
        <p className="text-xs text-gray-400 mt-2">The “Powered by SkillsAcademy.ai” line always stays.</p>
      </div>
      <div>
        <h3 className="font-semibold text-gray-900 mb-2">Search engines</h3>
        <div className="grid gap-3">
          <Txt label="Page title" hint="(blank = automatic)" value={page.seo.title} onChange={(v) => setPage({ ...page, seo: { ...page.seo, title: v } })} />
          <Txt label="Description" value={page.seo.description} rows={2} onChange={(v) => setPage({ ...page, seo: { ...page.seo, description: v } })} />
        </div>
      </div>
    </div>
  );
}

export default function AcademyDesigner({
  slug,
  academyName,
  initialPage,
  hasDraft: initialHasDraft,
  isLive: initialLive,
  publishedAt,
  versions,
  aiEnabled,
  siteIsPublished,
  brand,
}: {
  slug: string;
  academyName: string;
  initialPage: AcademyPage;
  hasDraft: boolean;
  isLive: boolean;
  publishedAt: string | null;
  versions: DesignerVersion[];
  aiEnabled: boolean;
  /** The academy's public site switch (Academy Site → Publish site). */
  siteIsPublished: boolean;
  brand: Brand;
}) {
  const [page, setPageState] = useState<AcademyPage>(initialPage);
  const [dirty, setDirty] = useState(false);
  const [hasDraft, setHasDraft] = useState(initialHasDraft);
  const [isLive, setIsLive] = useState(initialLive);
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

  const setPage = (p: AcademyPage) => {
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

  const colours = { primary: page.theme.primary || brand.primary, secondary: page.theme.secondary || brand.secondary, accent: page.theme.accent || brand.accent };
  const pic = (value: string | null, alt: string, heading: string, onChange: (k: string | null) => void, onAlt: (a: string) => void) => (
    <ImagePicker
      value={value}
      alt={alt}
      onChange={onChange}
      onAlt={onAlt}
      aiEnabled={aiEnabled}
      heading={heading}
      urlFor={(k) => academyImageUrl(slug, k)}
      upload={(fd) => uploadDesignImage(slug, fd)}
      draw={(subject, h) => aiDrawDesignImage(slug, subject, h, colours)}
      drawHint="(in your page's colours)"
    />
  );

  const sel = page.sections.find((s) => s.id === selected);
  const patch = (id: string, p: Partial<AcademySection>) => setPage({ ...page, sections: page.sections.map((s) => (s.id === id ? ({ ...s, ...p } as AcademySection) : s)) });
  const replaceSection = (next: AcademySection) => setPage({ ...page, sections: page.sections.map((s) => (s.id === next.id ? next : s)) });
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= page.sections.length) return;
    const next = [...page.sections];
    [next[i], next[j]] = [next[j], next[i]];
    setPage({ ...page, sections: next });
  };
  const duplicate = (i: number) => {
    const copy = { ...structuredClone(page.sections[i]), id: newSectionId(), anchor: "" } as AcademySection;
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
  const add = (type: AcademySectionType) => {
    const s = blankAcademySection(type, slug);
    const at = sel ? page.sections.findIndex((x) => x.id === sel.id) + 1 : page.sections.length;
    const next = [...page.sections];
    next.splice(at, 0, s);
    setPage({ ...page, sections: next });
    setSelected(s.id);
    setAdding(false);
  };

  function applyResult(r: DesignSaveResult, okText: string, opts: { draft: boolean }) {
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
  const save = () => guarded("save", async () => void applyResult(await saveDesignDraft(slug, JSON.stringify(page)), "Draft saved. Visitors still see the live page.", { draft: true }));
  const publish = () => {
    if (!window.confirm("Publish this design now? Visitors to your academy's page will see it straight away.")) return;
    return guarded("publish", async () => {
      if (applyResult(await publishDesign(slug, JSON.stringify(page)), "Published — your academy page is updated.", { draft: false })) {
        setLive(new Date().toISOString());
        setIsLive(true);
      }
    });
  };
  const discard = () => {
    if (!window.confirm("Throw away your unpublished changes and go back to the live page?")) return;
    return guarded("other", async () => void applyResult(await discardDesignDraft(slug), isLive ? "Changes discarded — this is the live page again." : "Changes discarded — back to the starting page.", { draft: !isLive }));
  };
  const rebuild = () => {
    if (!window.confirm("Replace the draft with a fresh page built from your academy's headline, tagline and Academy Site sections? (It only goes live when you publish.)")) return;
    return guarded("other", async () => void applyResult(await resetDesignToStart(slug), "A fresh starting page is loaded as your draft.", { draft: true }));
  };
  const restore = () => {
    if (!restoreId) return;
    if (!window.confirm("Load that earlier version as your draft? (It only goes live when you publish.)")) return;
    return guarded("other", async () => void applyResult(await restoreDesignVersion(slug, restoreId), "Earlier version loaded as your draft.", { draft: true }));
  };
  const takeDown = () => {
    if (!window.confirm("Take the designed page down? Visitors will see your original simple page again. Your design is kept as a draft you can publish later.")) return;
    return guarded("other", async () => {
      const r = await unpublishDesign(slug);
      if (r.ok) {
        setIsLive(false);
        setLive(null);
        setMsg({ kind: "ok", text: "The designed page is down — visitors see your original page again." });
      } else setMsg({ kind: "err", text: r.error });
    });
  };
  async function showPreview() {
    setTab("preview");
    if (dirty) await save();
  }

  const status = dirty ? "Unsaved changes" : hasDraft ? (isLive ? "Draft saved — not yet public" : "Draft saved — your design isn't live yet") : "Matches the live page";

  return (
    <div className="grid gap-4" data-testid="page-designer">
      <div className="app-card p-4 flex flex-wrap items-center gap-3 sticky top-0 z-10">
        <span className={`text-xs px-3 py-1.5 rounded-full font-semibold ${dirty ? "bg-amber-100 text-amber-800" : hasDraft ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`} data-testid="editor-status">
          {status}
        </span>
        <span className="text-xs text-gray-400" data-testid="live-state">
          {isLive && live ? `Design live since ${new Date(live).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "Visitors currently see your original simple page"}
          {!siteIsPublished && " · your academy site itself is not published"}
        </span>
        <span className="flex-1" />
        <div className="inline-flex rounded-md border border-gray-300 overflow-hidden text-xs font-semibold">
          <button type="button" className={`px-3 py-1.5 ${tab === "edit" ? "bg-gray-900 text-white" : "bg-white"}`} onClick={() => setTab("edit")} data-testid="tab-edit">Edit</button>
          <button type="button" className={`px-3 py-1.5 ${tab === "preview" ? "bg-gray-900 text-white" : "bg-white"}`} onClick={() => void showPreview()} data-testid="tab-preview">Preview</button>
        </div>
        <button type="button" className={btn} onClick={() => void save()} disabled={busy !== "" || !dirty} data-testid="save-draft">{busy === "save" ? "Saving…" : "Save draft"}</button>
        <button type="button" className={btnPrimary} onClick={() => void publish()} disabled={busy !== ""} data-testid="publish">{busy === "publish" ? "Publishing…" : "Publish"}</button>
        <details className="relative" ref={moreRef}>
          <summary className={`${btn} cursor-pointer list-none`}>More ▾</summary>
          <div className="absolute right-0 mt-1 w-80 bg-white border border-gray-200 rounded-lg shadow-lg p-3 grid gap-2 z-20">
            <button type="button" className={btn} onClick={() => void discard()} disabled={busy !== "" || (!hasDraft && !dirty)} data-testid="discard-draft">Discard changes (back to the live page)</button>
            <button type="button" className={btn} onClick={() => void rebuild()} disabled={busy !== ""} data-testid="reset-original">Rebuild from my current page content</button>
            <button type="button" className={btn} onClick={() => void takeDown()} disabled={busy !== "" || !isLive} data-testid="take-down">Take the designed page down</button>
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
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <div className="inline-flex rounded-md border border-gray-300 overflow-hidden text-xs font-semibold">
              <button type="button" className={`px-3 py-1.5 ${device === "desktop" ? "bg-gray-900 text-white" : "bg-white"}`} onClick={() => setDevice("desktop")}>Desktop</button>
              <button type="button" className={`px-3 py-1.5 ${device === "phone" ? "bg-gray-900 text-white" : "bg-white"}`} onClick={() => setDevice("phone")}>Phone</button>
            </div>
            <span className="text-xs text-gray-400">This is your saved draft — not the public page.</span>
            <span className="flex-1" />
            <a href={`/a/${slug}/admin/designer/preview`} target="_blank" rel="noreferrer" className="text-xs app-link font-semibold">Open in a new tab ↗</a>
            <a href={`/a/${slug}`} target="_blank" rel="noreferrer" className="text-xs app-link font-semibold">View the live page ↗</a>
          </div>
          <div className="flex justify-center bg-gray-100 rounded-lg p-3">
            <iframe key={previewKey} title="Page preview" src={`/a/${slug}/admin/designer/preview?v=${previewKey}`} className="bg-white rounded-md border border-gray-200" style={{ width: device === "phone" ? 390 : "100%", height: "75vh" }} data-testid="preview-frame" />
          </div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[19rem_1fr] gap-4 items-start">
          <div className="app-card p-3 grid gap-2" data-testid="section-list">
            <button type="button" onClick={() => setSelected("site")} className={`text-left rounded-md px-3 py-2 text-sm font-semibold border ${selected === "site" ? "border-gray-900 bg-gray-50" : "border-gray-200"}`} data-testid="select-site">
              🎨 Colours, fonts, menu &amp; footer
            </button>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mt-2">Sections, top to bottom</div>
            {page.sections.map((s, i) => (
              <div key={s.id} className={`rounded-md border ${selected === s.id ? "border-gray-900 bg-gray-50" : "border-gray-200"}`} data-testid="section-row">
                <button type="button" onClick={() => setSelected(s.id)} className="w-full text-left px-3 pt-2 pb-1">
                  <div className="text-[11px] text-gray-400">{ACADEMY_SECTION_LABEL[s.type]}{!s.visible && " · hidden"}</div>
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
                  {ACADEMY_SECTION_TYPES.map((t) => (
                    <button key={t} type="button" onClick={() => add(t)} className="text-left rounded-md border border-gray-200 px-3 py-2 hover:bg-gray-50" data-testid={`add-${t}`}>
                      <div className="text-sm font-semibold">{ACADEMY_SECTION_LABEL[t]}</div>
                      <div className="text-[11px] text-gray-500">{ACADEMY_SECTION_HINT[t]}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="app-card p-5 grid gap-4" data-testid="section-form">
            {selected === "site" || !sel ? (
              <LookSettings page={page} setPage={setPage} brand={brand} slug={slug} />
            ) : (
              <>
                <div>
                  <h2 className="font-semibold text-gray-900">{ACADEMY_SECTION_LABEL[sel.type]}</h2>
                  <p className="text-xs text-gray-500">{ACADEMY_SECTION_HINT[sel.type]}</p>
                </div>
                <SectionFields s={sel} set={(p) => patch(sel.id, p)} pic={pic} slug={slug} />
                <div className="grid md:grid-cols-2 gap-3 border-t border-gray-100 pt-4">
                  <Colour label="Background colour for this section" hint="(optional)" value={sel.bg} fallback="#ffffff" onChange={(v) => patch(sel.id, { bg: v })} testid="f-bg" />
                  <Txt label="Link name for this section" hint="(so a menu link like #courses can jump here)" value={sel.anchor} onChange={(v) => patch(sel.id, { anchor: v })} testid="f-anchor" />
                </div>
                {aiEnabled && <AiRewrite key={sel.id} section={sel} rewrite={(json, ask) => aiRewriteDesignSection(slug, json, ask)} onApply={replaceSection} />}
                <details className="text-xs text-gray-500">
                  <summary className="cursor-pointer select-none font-semibold">Placeholders you can type in any text</summary>
                  <ul className="mt-2 grid gap-1">
                    {ACADEMY_TOKEN_HELP.map((t) => (
                      <li key={t.token}><code className="bg-gray-100 rounded px-1">{t.token}</code> — {t.meaning}</li>
                    ))}
                  </ul>
                  <p className="mt-2">Your academy is called “{academyName}”.</p>
                </details>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
