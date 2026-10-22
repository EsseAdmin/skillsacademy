// Activities and resources: the catalogue shown in the "Add an activity or
// resource" picker, plus parsing and validation of every type's settings.
//
// Settings that don't need their own table (book chapters, glossary terms,
// poll options, lesson pages, assignment rules) are stored as JSON in
// modules.config_json. Everything a form posts is validated and clamped here,
// so the database only ever holds well-formed, size-limited content, and
// learner pages render from the parsed result rather than the raw string.
import type { ModuleContentType } from "@/lib/queries";

export type PickerGroup = "activity" | "resource";

export interface CatalogItem {
  type: ModuleContentType;
  label: string;
  icon: string;
  group: PickerGroup;
  blurb: string;
  /** Where the create flow starts. Quiz and SCORM already had their own builders. */
  href: "form" | "quiz" | "scorm";
}

export const CATALOG: CatalogItem[] = [
  { type: "ASSIGNMENT", label: "Assignment", icon: "📝", group: "activity", href: "form", blurb: "Learners hand in text and/or a file. You grade it and leave feedback." },
  { type: "BOOK", label: "Book", icon: "📖", group: "resource", href: "form", blurb: "A multi-chapter reading resource with a chapter menu." },
  { type: "CHOICE", label: "Choice", icon: "🗳️", group: "activity", href: "form", blurb: "A single-question poll. Learners pick an option; you can show the results." },
  { type: "FILE", label: "File", icon: "📎", group: "resource", href: "form", blurb: "Upload one Word, PDF, PowerPoint or other document." },
  { type: "FOLDER", label: "Folder", icon: "📁", group: "resource", href: "form", blurb: "Several files grouped together under one heading." },
  { type: "FORUM", label: "Forum", icon: "💬", group: "activity", href: "form", blurb: "A discussion board. Learners post and reply; you can hide posts." },
  { type: "GLOSSARY", label: "Glossary", icon: "🗃️", group: "resource", href: "form", blurb: "A searchable list of terms and definitions." },
  { type: "LESSON", label: "Lesson", icon: "🎓", group: "activity", href: "form", blurb: "Step-by-step pages, each with an optional question and feedback." },
  { type: "PAGE", label: "Page", icon: "📄", group: "resource", href: "form", blurb: "A formatted page with headings, lists, bold text and links." },
  { type: "QUIZ", label: "Quiz", icon: "🧪", group: "activity", href: "quiz", blurb: "Graded questions with a pass mark. Opens the quiz builder." },
  { type: "SCORM", label: "SCORM package", icon: "📦", group: "activity", href: "scorm", blurb: "Upload an e-learning package built in another authoring tool." },
  { type: "MEDIA", label: "Text and media area", icon: "🖼️", group: "resource", href: "form", blurb: "Some text with an image, audio clip or video shown inline." },
  { type: "URL", label: "URL", icon: "🔗", group: "resource", href: "form", blurb: "A link to a web page or online resource." },
  { type: "VIDEO", label: "Video", icon: "🎬", group: "resource", href: "form", blurb: "A YouTube or Vimeo link, or a small uploaded video." },
  { type: "LIVE_SESSION", label: "Live session", icon: "🎥", group: "activity", href: "form", blurb: "A Zoom or Microsoft Teams meeting link with a start time." },
  { type: "TEXT", label: "Plain text", icon: "✏️", group: "resource", href: "form", blurb: "Simple unformatted text." },
];

export const ACTIVITY_ICON: Record<string, string> = {
  ...Object.fromEntries(CATALOG.map((c) => [c.type, c.icon])),
};

export const ACTIVITY_LABEL: Record<string, string> = {
  ...Object.fromEntries(CATALOG.map((c) => [c.type, c.label])),
};

/** Types created through the generic activity form (everything new in this pass). */
export const CONFIG_TYPES = ["PAGE", "BOOK", "FOLDER", "MEDIA", "ASSIGNMENT", "CHOICE", "FORUM", "GLOSSARY", "LESSON"] as const;
export type ConfigType = (typeof CONFIG_TYPES)[number];
export function isConfigType(t: string): t is ConfigType {
  return (CONFIG_TYPES as readonly string[]).includes(t);
}

/** Types whose learner view is a page of its own (the rest render inline on the course page). */
export const ACTIVITY_PAGE_TYPES: ModuleContentType[] = ["BOOK", "GLOSSARY", "LESSON", "ASSIGNMENT", "CHOICE", "FORUM"];

/** Types completed by a learner action rather than a "Mark complete" click. */
export const AUTO_COMPLETE_TYPES: ModuleContentType[] = ["ASSIGNMENT", "CHOICE", "FORUM", "LESSON", "QUIZ", "SCORM"];

// ---------- limits ----------
export const LIMITS = {
  title: 200,
  chapterText: 20000,
  chapters: 50,
  pageText: 40000,
  glossaryTerms: 300,
  termLen: 120,
  definitionLen: 2000,
  choiceOptions: 10,
  optionLen: 200,
  questionLen: 500,
  lessonPages: 40,
  lessonOptions: 6,
  instructions: 10000,
  submissionText: 20000,
  forumBody: 4000,
  forumSubject: 160,
  // Netlify functions accept request bodies of about 6MB, so a single
  // upload action stays under 5MB in total.
  uploadTotalBytes: 5 * 1024 * 1024,
  folderFiles: 20,
};

export const MEDIA_MIME_PREFIXES: Record<string, "image" | "audio" | "video"> = {
  "image/png": "image",
  "image/jpeg": "image",
  "image/gif": "image",
  "image/webp": "image",
  "audio/mpeg": "audio",
  "audio/wav": "audio",
  "audio/ogg": "audio",
  "audio/mp4": "audio",
  "video/mp4": "video",
  "video/webm": "video",
  "video/ogg": "video",
};

export function mediaKindOf(mime: string | null | undefined): "image" | "audio" | "video" | null {
  return (mime && MEDIA_MIME_PREFIXES[mime.toLowerCase()]) || null;
}

const EXT_MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4",
  mp4: "video/mp4", webm: "video/webm",
};

/** The upload's media mime type, trusting the extension when the browser sent none. */
export function detectMediaMime(name: string, declared: string): string | null {
  const d = (declared || "").toLowerCase();
  if (MEDIA_MIME_PREFIXES[d]) return d;
  const ext = name.toLowerCase().split(".").pop() || "";
  return EXT_MIME[ext] ?? null;
}

// ---------- helpers ----------
export function clip(v: unknown, max: number): string {
  return String(v ?? "").replace(/\r\n/g, "\n").slice(0, max).trim();
}

// ---------- config shapes ----------
export interface Chapter { title: string; text: string }
export interface GlossaryTerm { term: string; definition: string }
export interface LessonQuestion { prompt: string; options: string[]; correct: number; feedbackCorrect: string; feedbackWrong: string }
export interface LessonPage { title: string; text: string; question: LessonQuestion | null }
export interface AssignmentConfig { dueAt: string | null; maxGrade: number; allowText: boolean; allowFile: boolean }
export interface ChoiceConfig { question: string; options: string[]; showResults: boolean; allowChange: boolean }
export interface ForumConfig { prompt: string }
export interface MediaConfig { caption: string }

export class ActivityInputError extends Error {}

function fail(msg: string): never {
  throw new ActivityInputError(msg);
}

function safeJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

// ---------- BOOK ----------
export function parseBookForm(fd: FormData): { chapters: Chapter[] } {
  const titles = fd.getAll("chapter_title").map(String);
  const texts = fd.getAll("chapter_text").map(String);
  const chapters: Chapter[] = [];
  for (let i = 0; i < Math.min(titles.length, LIMITS.chapters); i++) {
    const title = clip(titles[i], LIMITS.title);
    const text = clip(texts[i], LIMITS.chapterText);
    if (!title && !text) continue;
    chapters.push({ title: title || `Chapter ${chapters.length + 1}`, text });
  }
  if (chapters.length === 0) fail("Add at least one chapter to the book.");
  return { chapters };
}
export function readBook(raw: string | null): Chapter[] {
  const v = safeJson<{ chapters?: Chapter[] }>(raw, {});
  return Array.isArray(v.chapters) ? v.chapters.filter((c) => c && typeof c.title === "string").map((c) => ({ title: clip(c.title, LIMITS.title), text: clip(c.text, LIMITS.chapterText) })) : [];
}

// ---------- GLOSSARY ----------
export function parseGlossaryForm(fd: FormData): { terms: GlossaryTerm[] } {
  const ts = fd.getAll("term").map(String);
  const ds = fd.getAll("definition").map(String);
  const terms: GlossaryTerm[] = [];
  for (let i = 0; i < Math.min(ts.length, LIMITS.glossaryTerms); i++) {
    const term = clip(ts[i], LIMITS.termLen);
    const definition = clip(ds[i], LIMITS.definitionLen);
    if (!term && !definition) continue;
    if (!term || !definition) fail("Every glossary entry needs both a term and a definition.");
    terms.push({ term, definition });
  }
  if (terms.length === 0) fail("Add at least one glossary entry.");
  terms.sort((a, b) => a.term.localeCompare(b.term, undefined, { sensitivity: "base" }));
  return { terms };
}
export function readGlossary(raw: string | null): GlossaryTerm[] {
  const v = safeJson<{ terms?: GlossaryTerm[] }>(raw, {});
  return Array.isArray(v.terms) ? v.terms.filter((t) => t && typeof t.term === "string").map((t) => ({ term: clip(t.term, LIMITS.termLen), definition: clip(t.definition, LIMITS.definitionLen) })) : [];
}

// ---------- CHOICE ----------
export function parseChoiceForm(fd: FormData): ChoiceConfig {
  const question = clip(fd.get("choice_question"), LIMITS.questionLen);
  if (!question) fail("Write the question learners will answer.");
  const options = fd.getAll("choice_option").map((o) => clip(o, LIMITS.optionLen)).filter(Boolean).slice(0, LIMITS.choiceOptions);
  if (options.length < 2) fail("A choice needs at least two options.");
  return { question, options, showResults: fd.get("show_results") === "on", allowChange: fd.get("allow_change") === "on" };
}
export function readChoice(raw: string | null): ChoiceConfig {
  const v = safeJson<Partial<ChoiceConfig>>(raw, {});
  return {
    question: clip(v.question, LIMITS.questionLen),
    options: Array.isArray(v.options) ? v.options.map((o) => clip(o, LIMITS.optionLen)).filter(Boolean) : [],
    showResults: !!v.showResults,
    allowChange: !!v.allowChange,
  };
}

// ---------- LESSON ----------
export function parseLessonForm(fd: FormData): { pages: LessonPage[] } {
  const titles = fd.getAll("lp_title").map(String);
  const texts = fd.getAll("lp_text").map(String);
  const prompts = fd.getAll("lp_question").map(String);
  const optionBlocks = fd.getAll("lp_options").map(String); // one option per line
  const corrects = fd.getAll("lp_correct").map(String); // 1-based option number
  const fbOk = fd.getAll("lp_feedback_correct").map(String);
  const fbNo = fd.getAll("lp_feedback_wrong").map(String);
  const pages: LessonPage[] = [];
  for (let i = 0; i < Math.min(titles.length, LIMITS.lessonPages); i++) {
    const title = clip(titles[i], LIMITS.title);
    const text = clip(texts[i], LIMITS.chapterText);
    const prompt = clip(prompts[i], LIMITS.questionLen);
    if (!title && !text && !prompt) continue;
    let question: LessonQuestion | null = null;
    if (prompt) {
      const options = String(optionBlocks[i] ?? "")
        .split("\n")
        .map((o) => clip(o, LIMITS.optionLen))
        .filter(Boolean)
        .slice(0, LIMITS.lessonOptions);
      if (options.length < 2) fail(`Page ${pages.length + 1}: a question needs at least two answer options (one per line).`);
      const correct = Math.round(Number(corrects[i])) - 1;
      if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) fail(`Page ${pages.length + 1}: choose which answer number is correct.`);
      question = { prompt, options, correct, feedbackCorrect: clip(fbOk[i], 500), feedbackWrong: clip(fbNo[i], 500) };
    }
    pages.push({ title: title || `Page ${pages.length + 1}`, text, question });
  }
  if (pages.length === 0) fail("Add at least one page to the lesson.");
  return { pages };
}
export function readLesson(raw: string | null): LessonPage[] {
  const v = safeJson<{ pages?: LessonPage[] }>(raw, {});
  if (!Array.isArray(v.pages)) return [];
  return v.pages
    .filter((p) => p && typeof p.title === "string")
    .map((p) => ({
      title: clip(p.title, LIMITS.title),
      text: clip(p.text, LIMITS.chapterText),
      question:
        p.question && Array.isArray(p.question.options) && p.question.options.length >= 2 && Number.isInteger(p.question.correct)
          ? {
              prompt: clip(p.question.prompt, LIMITS.questionLen),
              options: p.question.options.map((o) => clip(o, LIMITS.optionLen)),
              correct: p.question.correct,
              feedbackCorrect: clip(p.question.feedbackCorrect, 500),
              feedbackWrong: clip(p.question.feedbackWrong, 500),
            }
          : null,
    }));
}
/** Lesson pages as sent to a learner: the answer key is left out. */
export function lessonForLearner(pages: LessonPage[]) {
  return pages.map((p) => ({
    title: p.title,
    text: p.text,
    question: p.question ? { prompt: p.question.prompt, options: p.question.options } : null,
  }));
}

// ---------- ASSIGNMENT ----------
export function parseAssignmentForm(fd: FormData): AssignmentConfig {
  const allowText = fd.get("allow_text") === "on";
  const allowFile = fd.get("allow_file") === "on";
  if (!allowText && !allowFile) fail("Let learners hand in text, a file, or both.");
  const maxGrade = Math.round(Number(fd.get("max_grade") || 100));
  if (!Number.isFinite(maxGrade) || maxGrade < 1 || maxGrade > 1000) fail("The maximum grade must be between 1 and 1000.");
  const due = String(fd.get("due_at") || "").trim();
  let dueAt: string | null = null;
  if (due) {
    const d = new Date(due);
    if (isNaN(d.getTime())) fail("That due date isn't valid.");
    dueAt = d.toISOString();
  }
  return { dueAt, maxGrade, allowText, allowFile };
}
export function readAssignment(raw: string | null): AssignmentConfig {
  const v = safeJson<Partial<AssignmentConfig>>(raw, {});
  return {
    dueAt: typeof v.dueAt === "string" ? v.dueAt : null,
    maxGrade: Number.isInteger(v.maxGrade) && v.maxGrade! >= 1 ? v.maxGrade! : 100,
    allowText: v.allowText !== false,
    allowFile: v.allowFile !== false,
  };
}

// ---------- FORUM / MEDIA ----------
export function readForum(raw: string | null): ForumConfig {
  const v = safeJson<Partial<ForumConfig>>(raw, {});
  return { prompt: clip(v.prompt, LIMITS.instructions) };
}
export function readMedia(raw: string | null): MediaConfig {
  const v = safeJson<Partial<MediaConfig>>(raw, {});
  return { caption: clip(v.caption, LIMITS.instructions) };
}

// ---------- PAGE: a tiny, safe markup renderer ----------
// Supported: "# " / "## " / "### " headings, "- " or "* " bullets, "1. "
// numbered items, blank-line paragraphs, **bold**, *italic* and
// [label](https://link). The result is plain data (blocks of inline pieces);
// the page component turns it into React elements, so no HTML string is ever
// built or injected.
export type Inline = { t: "text"; v: string } | { t: "b"; v: string } | { t: "i"; v: string } | { t: "a"; v: string; href: string };
export type Block =
  | { t: "h"; level: 1 | 2 | 3; inline: Inline[] }
  | { t: "p"; inline: Inline[] }
  | { t: "ul"; items: Inline[][] }
  | { t: "ol"; items: Inline[][] };

function httpsOrHttp(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  const re = /\[([^\]\n]{1,200})\]\(([^)\s]{1,2000})\)|\*\*([^*\n]{1,500})\*\*|\*([^*\n]{1,500})\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push({ t: "text", v: src.slice(last, m.index) });
    if (m[1] !== undefined) {
      const href = httpsOrHttp(m[2]);
      out.push(href ? { t: "a", v: m[1], href } : { t: "text", v: m[0] });
    } else if (m[3] !== undefined) out.push({ t: "b", v: m[3] });
    else out.push({ t: "i", v: m[4] });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ t: "text", v: src.slice(last) });
  return out;
}

export function parseMarkup(src: string): Block[] {
  const blocks: Block[] = [];
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  let para: string[] = [];
  let list: { kind: "ul" | "ol"; items: string[] } | null = null;
  const flushPara = () => {
    if (para.length) blocks.push({ t: "p", inline: parseInline(para.join(" ")) });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push({ t: list.kind, items: list.items.map(parseInline) });
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    const ul = /^\s*[-*]\s+(.+)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if (h) {
      flushPara();
      flushList();
      blocks.push({ t: "h", level: h[1].length as 1 | 2 | 3, inline: parseInline(h[2]) });
    } else if (ul || ol) {
      flushPara();
      const kind = ul ? "ul" : "ol";
      if (list && list.kind !== kind) flushList();
      if (!list) list = { kind, items: [] };
      list.items.push((ul || ol)![1]);
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return blocks;
}

// ---------- vote tally ----------
export function tallyVotes(optionCount: number, votes: { option_index: number }[]): number[] {
  const counts = new Array(optionCount).fill(0) as number[];
  for (const v of votes) if (v.option_index >= 0 && v.option_index < optionCount) counts[v.option_index]++;
  return counts;
}
