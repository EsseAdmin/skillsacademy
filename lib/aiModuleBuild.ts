// Turns one planned module (see AcademyPlanModule in lib/ai.ts) into a real
// module row, including its real content:
//   SLIDES   -> AI-written slides -> genuine .pptx -> a FILE module
//   DOCUMENT -> AI-written handout -> genuine .docx -> a FILE module
//   SCORM    -> AI-written lesson + quiz -> SCORM 1.2 zip -> a SCORM module
//               (installed through the same path as a manual SCORM upload)
//   VIDEO    -> the admin's own link if they supplied one, otherwise an
//               AI-written video script/brief on a VIDEO module with no video
//               yet (the AI can't make video — the admin records it and adds
//               the file/link via Edit content)
//   URL      -> the admin's own link if they supplied one, otherwise an empty
//               URL module ready for a link to be pasted in
//   TEXT     -> the original written outline
//
// Anything that goes wrong (no API key, a slow/failed AI call, an invalid
// response, a storage error) degrades to the TEXT outline so applying a plan
// never fails because one module couldn't be built — the module is flagged
// in the result so the caller can tell the admin.
import { MODULE_MINUTES_BY_KIND } from "@/lib/courseTypes";
import { Modules, type ModuleRow } from "@/lib/queries";
import { saveFile, deleteFile } from "@/lib/storage";
import { slugify } from "@/lib/utils";
import { readScormZip, storeScormPackage } from "@/lib/scorm/install";
import { buildPptx } from "@/lib/generators/pptx";
import { buildDocx } from "@/lib/generators/docx";
import { buildScormZip } from "@/lib/generators/scorm";
import type { ModuleKind, SlidesContent, DocumentContent, ScormContent, VideoBriefContent, TextLessonContent } from "@/lib/moduleContent";
import type { ModuleContext } from "@/lib/aiModuleContent";
import type { Lang } from "@/lib/i18n";

export const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export interface ModuleSpec {
  kind: ModuleKind;
  title: string;
  description: string;
  url?: string;
  // SLIDES only: also write a Word exercise sheet as a second module.
  exercises?: boolean;
  // Content agent: the detailed writing instructions for the author of the content
  // (the description stays a short line for learners).
  brief?: string;
}

export interface ContentProvider {
  slides(ctx: ModuleContext, opts: { timeoutMs: number }): Promise<SlidesContent>;
  document(ctx: ModuleContext, opts: { timeoutMs: number }): Promise<DocumentContent>;
  exercises(ctx: ModuleContext, opts: { timeoutMs: number }): Promise<DocumentContent>;
  scorm(ctx: ModuleContext, opts: { timeoutMs: number }): Promise<ScormContent>;
  videoBrief(ctx: ModuleContext, opts: { timeoutMs: number }): Promise<VideoBriefContent>;
  // A full written lesson (used by the content agent's "strict" builds).
  text?(ctx: ModuleContext, opts: { timeoutMs: number }): Promise<TextLessonContent>;
}

// Loaded lazily so code paths that never generate rich content (and tests
// that inject their own provider) don't pull in the Anthropic client.
async function defaultProvider(): Promise<ContentProvider> {
  const m = await import("@/lib/aiModuleContent");
  return { slides: m.generateSlides, document: m.generateDocument, exercises: m.generateExercises, scorm: m.generateScorm, videoBrief: m.generateVideoBrief, text: m.generateTextLesson };
}

export interface BuildContext {
  academyId: string;
  createdByUserId: string;
  academyName: string;
  // Language the academy teaches in; defaults to English.
  language?: Lang;
  courseTitle: string;
  courseDescription: string;
  primaryColor: string;
  accentColor: string;
  // Absolute deadline (ms since epoch) by which all generation for this
  // apply must be finished; calls that wouldn't fit fall back to text.
  deadline: number;
  provider?: ContentProvider;
  // Content-agent builds: every module must be real, usable content. A written
  // lesson is written in full (not an outline), and when generation fails or
  // runs out of time the module is NOT replaced by a placeholder draft — the
  // build throws, so the job can be retried and nothing half-made is left.
  strict?: boolean;
}

export interface BuildResult {
  module: ModuleRow;
  kind: ModuleKind; // what was actually created (TEXT if it fell back)
  fellBack: boolean;
  // Rough study time in minutes (defaults per kind are applied by the caller).
  studyMinutes?: number;
  // True for the Word exercise sheet that accompanies a deck (it gets no picture of its own).
  isExercises?: boolean;
}

const MIN_BUDGET_MS = 6000; // don't start an AI call with less than this left
const MAX_CALL_MS = 35000;
const RESERVE_MS = 3000; // for building + storing files after the call

const FORMAT_LABEL: Record<string, string> = { SLIDES: "PowerPoint deck", DOCUMENT: "Word handout", SCORM: "interactive SCORM lesson", VIDEO: "video script" };

function textDraft(spec: ModuleSpec, fellBackFrom?: ModuleKind): string {
  const base = `Draft outline — replace with your real lesson content:\n\n${spec.description}`;
  if (!fellBackFrom || !FORMAT_LABEL[fellBackFrom]) return base;
  return `${base}\n\n(This module was planned as a ${FORMAT_LABEL[fellBackFrom]}, but it couldn't be generated automatically. Add the real content from the Modules page.)`;
}

async function createText(spec: ModuleSpec, ctx: BuildContext, fellBackFrom?: ModuleKind): Promise<BuildResult> {
  const mod = await Modules.create({
    academy_id: ctx.academyId,
    created_by: ctx.createdByUserId,
    title: spec.title,
    description: spec.description,
    content_type: "TEXT",
    content_text: textDraft(spec, fellBackFrom),
  });
  return { module: mod, kind: "TEXT", fellBack: !!fellBackFrom };
}

async function createFileModule(spec: ModuleSpec, ctx: BuildContext, buffer: Buffer, ext: string, mime: string): Promise<ModuleRow> {
  const base = slugify(spec.title) || "module";
  const fileName = `${base}.${ext}`;
  const storedName = `${crypto.randomUUID()}-${fileName}`;
  await saveFile(storedName, buffer);
  try {
    return await Modules.create({
      academy_id: ctx.academyId,
      created_by: ctx.createdByUserId,
      title: spec.title,
      description: spec.description,
      content_type: "FILE",
      file_path: storedName,
      file_name: fileName,
      file_mime: mime,
      file_size: buffer.length,
    });
  } catch (err) {
    await deleteFile(storedName).catch(() => {});
    throw err;
  }
}

function moduleContext(spec: ModuleSpec, ctx: BuildContext): ModuleContext {
  return {
    academyName: ctx.academyName,
    courseTitle: ctx.courseTitle,
    courseDescription: ctx.courseDescription,
    moduleTitle: spec.title,
    moduleDescription: spec.description,
    language: ctx.language,
    ...(spec.brief ? { instruction: spec.brief } : {}),
  };
}

function strictTimeout(ctx: BuildContext, what: string): number {
  const remaining = ctx.deadline - Date.now();
  if (remaining < MIN_BUDGET_MS + RESERVE_MS) throw new Error(`Not enough time left in this step to generate ${what}.`);
  return Math.min(MAX_CALL_MS, remaining - RESERVE_MS);
}

async function buildStrictText(spec: ModuleSpec, ctx: BuildContext): Promise<BuildResult> {
  const provider = ctx.provider ?? (await defaultProvider());
  if (!provider.text) throw new Error("This content provider can't write lessons.");
  const lesson = await provider.text(moduleContext(spec, ctx), { timeoutMs: strictTimeout(ctx, `the lesson "${spec.title}"`) });
  const mod = await Modules.create({
    academy_id: ctx.academyId,
    created_by: ctx.createdByUserId,
    title: spec.title,
    description: spec.description || lesson.description,
    content_type: "TEXT",
    content_text: lesson.content,
  });
  return { module: mod, kind: "TEXT", fellBack: false, studyMinutes: Math.max(5, Math.round(lesson.content.split(/\s+/).length / 180)) };
}

export async function buildModule(spec: ModuleSpec, ctx: BuildContext): Promise<BuildResult> {
  if (spec.kind === "TEXT") return ctx.strict ? buildStrictText(spec, ctx) : createText(spec, ctx);

  if (spec.kind === "URL") {
    const mod = await Modules.create({
      academy_id: ctx.academyId,
      created_by: ctx.createdByUserId,
      title: spec.title,
      description: spec.description,
      content_type: "URL",
      content_url: spec.url ?? null,
    });
    return { module: mod, kind: "URL", fellBack: false };
  }

  if (spec.kind === "VIDEO" && spec.url) {
    const mod = await Modules.create({
      academy_id: ctx.academyId,
      created_by: ctx.createdByUserId,
      title: spec.title,
      description: spec.description,
      content_type: "VIDEO",
      content_url: spec.url,
    });
    return { module: mod, kind: "VIDEO", fellBack: false };
  }

  // SLIDES / DOCUMENT / SCORM / VIDEO-without-link all need an AI call.
  const remaining = ctx.deadline - Date.now();
  if (remaining < MIN_BUDGET_MS + RESERVE_MS) {
    if (ctx.strict) throw new Error(`Not enough time left in this step to generate ${spec.kind} for "${spec.title}".`);
    console.warn(`[ai] Not enough time left to generate ${spec.kind} for "${spec.title}" — using a text draft.`);
    return createText(spec, ctx, spec.kind);
  }
  const timeoutMs = Math.min(MAX_CALL_MS, remaining - RESERVE_MS);
  const mctx = moduleContext(spec, ctx);

  try {
    const provider = ctx.provider ?? (await defaultProvider());
    if (spec.kind === "SLIDES") {
      const content = await provider.slides(mctx, { timeoutMs });
      const buf = await buildPptx(content, { academyName: ctx.academyName, primary: ctx.primaryColor, accent: ctx.accentColor });
      return { module: await createFileModule(spec, ctx, buf, "pptx", PPTX_MIME), kind: "SLIDES", fellBack: false };
    }
    if (spec.kind === "DOCUMENT") {
      const content = await provider.document(mctx, { timeoutMs });
      const buf = await buildDocx(content, { academyName: ctx.academyName, primary: ctx.primaryColor });
      return { module: await createFileModule(spec, ctx, buf, "docx", DOCX_MIME), kind: "DOCUMENT", fellBack: false };
    }
    if (spec.kind === "SCORM") {
      const content = await provider.scorm(mctx, { timeoutMs });
      const zip = await buildScormZip(content, crypto.randomUUID());
      // Parse before creating the module row, same as the manual upload.
      const read = await readScormZip(zip);
      const mod = await Modules.create({
        academy_id: ctx.academyId,
        created_by: ctx.createdByUserId,
        title: spec.title,
        description: spec.description,
        content_type: "SCORM",
      });
      try {
        await storeScormPackage({ read, moduleId: mod.id, academyId: ctx.academyId, fallbackTitle: spec.title });
      } catch (err) {
        await Modules.remove(mod.id).catch(() => {});
        throw err;
      }
      return { module: mod, kind: "SCORM", fellBack: false };
    }
    // VIDEO without a link: a script for the admin to record.
    const brief = await provider.videoBrief(mctx, { timeoutMs });
    const mod = await Modules.create({
      academy_id: ctx.academyId,
      created_by: ctx.createdByUserId,
      title: spec.title,
      description: spec.description,
      content_type: "VIDEO",
      content_text: `Video brief — suggested length ${brief.durationMinutes} min\n\n${brief.script}`,
    });
    return { module: mod, kind: "VIDEO", fellBack: false };
  } catch (err) {
    if (ctx.strict) throw err;
    console.error(`[ai] Couldn't build ${spec.kind} module "${spec.title}" — falling back to a text draft:`, err);
    return createText(spec, ctx, spec.kind);
  }
}

// A planned module can become more than one module: a PowerPoint also gets
// a Word "Exercises" sheet right after it. The deck and the sheet are written
// by two parallel AI calls (so a pack takes about as long as one call), and
// the sheet is simply skipped if it can't be built — an empty or text-draft
// "Exercises" module would just be clutter.
export interface PackResult {
  results: BuildResult[];
  skippedExercises: number;
}

async function buildExercisesModule(spec: ModuleSpec, ctx: BuildContext): Promise<BuildResult | null> {
  const remaining = ctx.deadline - Date.now();
  if (remaining < MIN_BUDGET_MS + RESERVE_MS) {
    if (ctx.strict) throw new Error(`Not enough time left in this step to generate exercises for "${spec.title}".`);
    console.warn(`[ai] Not enough time left to generate exercises for "${spec.title}" — skipping them.`);
    return null;
  }
  const timeoutMs = Math.min(MAX_CALL_MS, remaining - RESERVE_MS);
  const mctx = moduleContext(spec, ctx);
  try {
    const provider = ctx.provider ?? (await defaultProvider());
    const content = await provider.exercises(mctx, { timeoutMs });
    const buf = await buildDocx(content, { academyName: ctx.academyName, primary: ctx.primaryColor });
    const exSpec: ModuleSpec = {
      kind: "DOCUMENT",
      title: `${spec.title} — Exercises`,
      description: `Practice exercises for "${spec.title}". Work through these after the slides.`,
    };
    return { module: await createFileModule(exSpec, ctx, buf, "docx", DOCX_MIME), kind: "DOCUMENT", fellBack: false, studyMinutes: MODULE_MINUTES_BY_KIND.EXERCISES, isExercises: true };
  } catch (err) {
    if (ctx.strict) throw err;
    console.error(`[ai] Couldn't build exercises for "${spec.title}" — skipping them:`, err);
    return null;
  }
}

async function removeBuilt(r: BuildResult): Promise<void> {
  try {
    if (r.module.file_path) await deleteFile(r.module.file_path).catch(() => {});
    await Modules.remove(r.module.id);
  } catch {
    /* best effort */
  }
}

export async function buildModulePack(spec: ModuleSpec, ctx: BuildContext): Promise<PackResult> {
  if (spec.kind !== "SLIDES" || !spec.exercises) {
    return { results: [await buildModule(spec, ctx)], skippedExercises: 0 };
  }
  if (ctx.strict) {
    // All or nothing: if either file fails, remove the one that was made so a retry starts clean.
    const settled = await Promise.allSettled([buildModule(spec, ctx), buildExercisesModule(spec, ctx)]);
    const failed = settled.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failed) {
      for (const r of settled) if (r.status === "fulfilled" && r.value) await removeBuilt(r.value);
      throw failed.reason;
    }
    const [deck, exercises] = settled.map((r) => (r as PromiseFulfilledResult<BuildResult | null>).value) as [BuildResult, BuildResult | null];
    return { results: exercises ? [deck, exercises] : [deck], skippedExercises: 0 };
  }
  const [deck, exercises] = await Promise.all([buildModule(spec, ctx), buildExercisesModule(spec, ctx)]);
  return { results: exercises ? [deck, exercises] : [deck], skippedExercises: exercises ? 0 : 1 };
}

// Runs fn over items with at most `limit` in flight, preserving result order.
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
