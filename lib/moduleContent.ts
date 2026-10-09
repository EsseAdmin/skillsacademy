// Shapes + validation for the rich lesson content the AI generator writes
// for a single module. Kept free of any Anthropic/DB/file-format imports so
// it can be shared by the AI call (lib/aiModuleContent.ts), the file
// builders (lib/generators/*) and unit-style checks alike.
//
// Every sanitiser here is deliberately strict and total: it accepts
// `unknown` (a raw tool-use payload from the model), clamps every string
// and array, and returns null when there's nothing usable — so a malformed
// or adversarial response can only ever produce a smaller/blank module,
// never an oversized file or a crash.

export type ModuleKind = "TEXT" | "SLIDES" | "DOCUMENT" | "VIDEO" | "SCORM" | "URL";
export const MODULE_KINDS: ModuleKind[] = ["TEXT", "SLIDES", "DOCUMENT", "VIDEO", "SCORM", "URL"];

export interface SlideContent {
  title: string;
  bullets: string[];
  notes: string;
}
export interface SlidesContent {
  deckTitle: string;
  slides: SlideContent[];
}

export interface DocumentSection {
  heading: string;
  paragraphs: string[];
  bullets: string[];
}
export interface DocumentContent {
  title: string;
  intro: string;
  sections: DocumentSection[];
}

export interface ScormPage {
  heading: string;
  paragraphs: string[];
  bullets: string[];
}
export interface ScormQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}
export interface ScormContent {
  title: string;
  pages: ScormPage[];
  questions: ScormQuestion[];
  passMarkPct: number;
}

export interface VideoBriefContent {
  script: string;
  durationMinutes: number;
}

export const LIMITS = {
  maxSlides: 10,
  maxBulletsPerSlide: 6,
  maxSections: 8,
  maxScormPages: 6,
  maxScormQuestions: 5,
  maxOptions: 5,
};

export function clampText(value: unknown, maxLen: number, fallback = ""): string {
  const s = typeof value === "string" ? value.replace(/\u0000/g, "").trim() : "";
  if (!s) return fallback;
  return s.length > maxLen ? s.slice(0, maxLen).trim() : s;
}

function clampList(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, maxItems)
    .map((v) => clampText(v, maxLen))
    .filter((v) => v.length > 0);
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export function sanitizeSlides(raw: unknown, fallbackTitle: string): SlidesContent | null {
  const r = asRecord(raw);
  if (!r || !Array.isArray(r.slides)) return null;
  const slides: SlideContent[] = [];
  for (const s of r.slides.slice(0, LIMITS.maxSlides)) {
    const sr = asRecord(s);
    if (!sr) continue;
    const title = clampText(sr.title, 100);
    const bullets = clampList(sr.bullets, LIMITS.maxBulletsPerSlide, 220);
    if (!title || bullets.length === 0) continue;
    slides.push({ title, bullets, notes: clampText(sr.notes, 1200) });
  }
  if (slides.length === 0) return null;
  return { deckTitle: clampText(r.deckTitle, 120, fallbackTitle), slides };
}

export function sanitizeDocument(raw: unknown, fallbackTitle: string): DocumentContent | null {
  const r = asRecord(raw);
  if (!r || !Array.isArray(r.sections)) return null;
  const sections: DocumentSection[] = [];
  for (const s of r.sections.slice(0, LIMITS.maxSections)) {
    const sr = asRecord(s);
    if (!sr) continue;
    const heading = clampText(sr.heading, 120);
    const paragraphs = clampList(sr.paragraphs, 5, 1500);
    const bullets = clampList(sr.bullets, 8, 300);
    if (!heading || (paragraphs.length === 0 && bullets.length === 0)) continue;
    sections.push({ heading, paragraphs, bullets });
  }
  if (sections.length === 0) return null;
  return { title: clampText(r.title, 140, fallbackTitle), intro: clampText(r.intro, 1500), sections };
}

export function sanitizeScorm(raw: unknown, fallbackTitle: string): ScormContent | null {
  const r = asRecord(raw);
  if (!r || !Array.isArray(r.pages)) return null;
  const pages: ScormPage[] = [];
  for (const p of r.pages.slice(0, LIMITS.maxScormPages)) {
    const pr = asRecord(p);
    if (!pr) continue;
    const heading = clampText(pr.heading, 120);
    const paragraphs = clampList(pr.paragraphs, 4, 1200);
    const bullets = clampList(pr.bullets, 8, 300);
    if (!heading || (paragraphs.length === 0 && bullets.length === 0)) continue;
    pages.push({ heading, paragraphs, bullets });
  }
  if (pages.length === 0) return null;

  const questions: ScormQuestion[] = [];
  for (const q of (Array.isArray(r.questions) ? r.questions : []).slice(0, LIMITS.maxScormQuestions)) {
    const qr = asRecord(q);
    if (!qr) continue;
    const question = clampText(qr.question, 300);
    const options = clampList(qr.options, LIMITS.maxOptions, 200);
    const correctIndex = typeof qr.correctIndex === "number" ? Math.trunc(qr.correctIndex) : -1;
    // A question needs at least two options and a correct answer that
    // actually points at one of them, otherwise it could never be passed.
    if (!question || options.length < 2 || correctIndex < 0 || correctIndex >= options.length) continue;
    questions.push({ question, options, correctIndex, explanation: clampText(qr.explanation, 400) });
  }

  const pass = typeof r.passMarkPct === "number" ? Math.round(r.passMarkPct) : 70;
  return {
    title: clampText(r.title, 120, fallbackTitle),
    pages,
    questions,
    passMarkPct: Math.min(100, Math.max(40, pass)),
  };
}

export function sanitizeVideoBrief(raw: unknown): VideoBriefContent | null {
  const r = asRecord(raw);
  if (!r) return null;
  const script = clampText(r.script, 4000);
  if (!script) return null;
  const mins = typeof r.durationMinutes === "number" ? Math.round(r.durationMinutes) : 5;
  return { script, durationMinutes: Math.min(30, Math.max(1, mins)) };
}

// Display helpers shared by the plan previews (signup wizard + dashboard).
export const KIND_LABEL: Record<ModuleKind, string> = {
  TEXT: "Text",
  SLIDES: "PowerPoint",
  DOCUMENT: "Word doc",
  VIDEO: "Video",
  SCORM: "SCORM lesson",
  URL: "Web link",
};
export const KIND_ICON: Record<ModuleKind, string> = { TEXT: "📝", SLIDES: "📊", DOCUMENT: "📄", VIDEO: "🎬", SCORM: "📦", URL: "🔗" };

// e.g. "2 PowerPoint, 1 Word doc, 1 SCORM lesson" — empty string if every
// module is plain text.
export function summariseKinds(modules: { kind: ModuleKind; exercises?: boolean }[]): string {
  const counts = new Map<ModuleKind, number>();
  for (const m of modules) {
    if (m.kind !== "TEXT") counts.set(m.kind, (counts.get(m.kind) ?? 0) + 1);
    // A PowerPoint's companion Word exercise sheet is a Word doc too.
    if (m.kind === "SLIDES" && m.exercises) counts.set("DOCUMENT", (counts.get("DOCUMENT") ?? 0) + 1);
  }
  return MODULE_KINDS.filter((k) => counts.has(k))
    .map((k) => `${counts.get(k)} ${KIND_LABEL[k]}`)
    .join(", ");
}
