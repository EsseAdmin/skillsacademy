// The content development agent.
//
// What it is: a request/review loop around the AI content generators. A person
// (an academy admin, or an instructor) asks for a change — "make this lesson
// simpler", "rebuild this deck with a worked example", "write a new module on
// X" — and the agent writes a *draft* of the result. That is all the agent
// ever does on its own.
//
// The rules this file enforces (each is covered by scripts/ai-agent-test.ts):
//   1. One academy only. Every read and write here is keyed on the session's
//      own academy id, never on an id taken from the request. A module, course
//      or draft from another academy is treated as not existing.
//   2. Nothing is changed without a person approving. A draft is stored as
//      PENDING with the proposed content; modules, courses and files are only
//      touched inside approveDraft(). The agent has no way to publish, email,
//      grade or delete anything — it can only propose, and approval applies
//      exactly what was proposed.
//   3. Every AI call is counted against the academy's monthly plan cap (see
//      lib/aiUsage.ts); when the cap is reached the request is refused before
//      any text is generated.
//   4. Instructors are limited to their own work: modules they created or are
//      assigned to (directly or through a course they teach). Admins can work
//      on anything in their academy.
import JSZip from "jszip";
import { queryAll, queryOne, exec, newId, nowIso } from "@/lib/db";
import { Academies, Courses, Modules, Templates, type ModuleRow } from "@/lib/queries";
import { saveFile } from "@/lib/storage";
import { slugify } from "@/lib/utils";
import { INSTRUCTOR_MODULE_SQL } from "@/lib/moduleAccess";
import { buildPptx } from "@/lib/generators/pptx";
import { buildDocx } from "@/lib/generators/docx";
import { PPTX_MIME, DOCX_MIME } from "@/lib/aiModuleBuild";
import { withAiMeter, getAiUsage } from "@/lib/aiUsage";
import { clampText, type SlidesContent, type DocumentContent, type TextLessonContent } from "@/lib/moduleContent";
import type { ModuleContext } from "@/lib/aiModuleContent";
import type { SessionPayload } from "@/lib/auth";

export type AgentAction = "IMPROVE_TEXT" | "REBUILD_FILE" | "NEW_MODULE";
export type AgentKind = "TEXT" | "SLIDES" | "DOCUMENT";
export type DraftStatus = "PENDING" | "APPROVED" | "REJECTED" | "RESTORED";

export const AGENT_ACTIONS: AgentAction[] = ["IMPROVE_TEXT", "REBUILD_FILE", "NEW_MODULE"];
export const AGENT_KINDS: AgentKind[] = ["TEXT", "SLIDES", "DOCUMENT"];
export const ACTION_LABEL: Record<AgentAction, string> = {
  IMPROVE_TEXT: "Improve a written module",
  REBUILD_FILE: "Rebuild a PowerPoint / Word module",
  NEW_MODULE: "Draft a new module",
};
export const MAX_INSTRUCTION = 1500;
export const MAX_PENDING_PER_ACADEMY = 25;
const REQUEST_TIMEOUT_MS = 40_000;
const MAX_CURRENT_CHARS = 12_000;

/** A message that is safe to show the person as-is. */
export class AgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentError";
  }
}
export function isAgentError(err: unknown): err is AgentError {
  return err instanceof AgentError || (err as { name?: string } | null)?.name === "AgentError";
}

// What the agent proposes. Exactly one of text / slides / document is set,
// matching the draft's kind.
export interface Proposal {
  title: string;
  description: string;
  text?: string;
  slides?: SlidesContent;
  document?: DocumentContent;
}

export interface FilePrevious {
  file_path: string | null;
  file_name: string | null;
  file_mime: string | null;
  file_size: number | null;
  title: string;
  description: string;
}
export interface TextPrevious {
  title: string;
  description: string;
  content_text: string | null;
}

export interface DraftRow {
  id: string;
  academy_id: string;
  requested_by: string;
  action: AgentAction;
  instruction: string;
  target_module_id: string | null;
  target_course_id: string | null;
  kind: AgentKind;
  title: string;
  proposal_json: string;
  previous_json: string | null;
  status: DraftStatus;
  result_module_id: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface AgentProvider {
  text(ctx: ModuleContext, opts: { timeoutMs: number }): Promise<TextLessonContent>;
  slides(ctx: ModuleContext, opts: { timeoutMs: number }): Promise<SlidesContent>;
  document(ctx: ModuleContext, opts: { timeoutMs: number }): Promise<DocumentContent>;
}

async function defaultProvider(): Promise<AgentProvider> {
  const m = await import("@/lib/aiModuleContent");
  return { text: m.generateTextLesson, slides: m.generateSlides, document: m.generateDocument };
}

// ---------- Draft storage (always scoped by academy) ----------
export const AiDrafts = {
  async byId(academyId: string, id: string): Promise<DraftRow | undefined> {
    return queryOne<DraftRow>("SELECT * FROM ai_drafts WHERE id = $1 AND academy_id = $2", [id, academyId]);
  },
  async list(academyId: string, opts: { requestedBy?: string; limit?: number } = {}): Promise<DraftRow[]> {
    const params: unknown[] = [academyId];
    let where = "academy_id = $1";
    if (opts.requestedBy) {
      params.push(opts.requestedBy);
      where += ` AND requested_by = $${params.length}`;
    }
    params.push(opts.limit ?? 40);
    return queryAll<DraftRow>(`SELECT * FROM ai_drafts WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length}`, params);
  },
  async countPending(academyId: string): Promise<number> {
    const row = await queryOne<{ n: string }>("SELECT count(*) AS n FROM ai_drafts WHERE academy_id = $1 AND status = 'PENDING'", [academyId]);
    return Number(row?.n ?? 0);
  },
  // Moves a draft from `from` to `to` only if it is still in `from`, so two
  // people (or a double click) can't approve the same draft twice.
  async claim(academyId: string, id: string, from: DraftStatus, to: DraftStatus, decidedBy: string): Promise<boolean> {
    const row = await queryOne<{ id: string }>(
      "UPDATE ai_drafts SET status = $1, decided_by = $2, decided_at = $3 WHERE id = $4 AND academy_id = $5 AND status = $6 RETURNING id",
      [to, decidedBy, nowIso(), id, academyId, from]
    );
    return !!row;
  },
  async release(academyId: string, id: string, back: DraftStatus): Promise<void> {
    await exec("UPDATE ai_drafts SET status = $1, decided_by = NULL, decided_at = NULL WHERE id = $2 AND academy_id = $3", [back, id, academyId]);
  },
  async finish(academyId: string, id: string, patch: { previous_json?: string | null; result_module_id?: string | null }): Promise<void> {
    await exec(
      "UPDATE ai_drafts SET previous_json = COALESCE($1, previous_json), result_module_id = COALESCE($2, result_module_id) WHERE id = $3 AND academy_id = $4",
      [patch.previous_json ?? null, patch.result_module_id ?? null, id, academyId]
    );
  },
};

// ---------- Who may work on what ----------
function isAdmin(session: SessionPayload): boolean {
  return session.role === "ACADEMY_ADMIN";
}
function requireTenant(session: SessionPayload): string {
  if (!session.academyId || (session.role !== "ACADEMY_ADMIN" && session.role !== "INSTRUCTOR")) {
    throw new AgentError("You don't have access to the content agent.");
  }
  return session.academyId;
}

// INSTRUCTOR_MODULE_SQL (who counts as an instructor's own module) lives in
// lib/moduleAccess.ts so the activity pages share exactly the same rule.

export async function agentModulesFor(session: SessionPayload): Promise<ModuleRow[]> {
  const academyId = requireTenant(session);
  if (isAdmin(session)) return Modules.listByAcademy(academyId);
  return queryAll<ModuleRow>(`SELECT m.* FROM modules m WHERE m.academy_id = $1 AND (${INSTRUCTOR_MODULE_SQL}) ORDER BY m.created_at DESC`, [academyId, session.userId]);
}

export async function canEditModule(session: SessionPayload, moduleId: string): Promise<ModuleRow | undefined> {
  const academyId = requireTenant(session);
  if (isAdmin(session)) {
    return queryOne<ModuleRow>("SELECT * FROM modules WHERE id = $1 AND academy_id = $2", [moduleId, academyId]);
  }
  return queryOne<ModuleRow>(`SELECT m.* FROM modules m WHERE m.id = $3 AND m.academy_id = $1 AND (${INSTRUCTOR_MODULE_SQL})`, [academyId, session.userId, moduleId]);
}

export interface CourseOption {
  id: string;
  title: string;
  description: string;
}

export async function agentCoursesFor(session: SessionPayload): Promise<CourseOption[]> {
  const academyId = requireTenant(session);
  if (isAdmin(session)) {
    return queryAll<CourseOption>("SELECT id, title, description FROM courses WHERE academy_id = $1 ORDER BY title", [academyId]);
  }
  return queryAll<CourseOption>(
    `SELECT c.id, c.title, c.description FROM courses c
     WHERE c.academy_id = $1 AND (c.created_by = $2 OR EXISTS (SELECT 1 FROM course_instructors ci WHERE ci.course_id = c.id AND ci.instructor_id = $2))
     ORDER BY c.title`,
    [academyId, session.userId]
  );
}

async function canUseCourse(session: SessionPayload, courseId: string): Promise<CourseOption | undefined> {
  return (await agentCoursesFor(session)).find((c) => c.id === courseId);
}

// The first course (in this academy) a module sits in — context for the AI.
async function courseOfModule(academyId: string, moduleId: string): Promise<{ title: string; description: string } | undefined> {
  return queryOne<{ title: string; description: string }>(
    `SELECT c.title, c.description FROM course_modules cm JOIN courses c ON c.id = cm.course_id
     WHERE cm.module_id = $1 AND c.academy_id = $2 ORDER BY cm.order_index LIMIT 1`,
    [moduleId, academyId]
  );
}

// ---------- Reading a module's current content ----------
function decodeXml(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function textRuns(xml: string, run: string, para: string): string {
  const out: string[] = [];
  const paraRe = new RegExp(`<${para}[\\s>][\\s\\S]*?</${para}>`, "g");
  const runRe = new RegExp(`<${run}(?:\\s[^>]*)?>([^<]*)</${run}>`, "g");
  for (const p of xml.match(paraRe) ?? []) {
    const parts: string[] = [];
    for (const m of p.matchAll(runRe)) parts.push(decodeXml(m[1]));
    const line = parts.join("").trim();
    if (line) out.push(line);
  }
  return out.join("\n");
}

export type FileKind = "SLIDES" | "DOCUMENT";
export function fileKindOf(m: Pick<ModuleRow, "content_type" | "file_mime" | "file_name">): FileKind | null {
  if (m.content_type !== "FILE") return null;
  const name = (m.file_name || "").toLowerCase();
  if (m.file_mime === PPTX_MIME || name.endsWith(".pptx")) return "SLIDES";
  if (m.file_mime === DOCX_MIME || name.endsWith(".docx")) return "DOCUMENT";
  return null;
}

export async function extractModuleText(m: ModuleRow, readFileFn: (key: string) => Promise<Buffer | null>): Promise<string> {
  if (m.content_type === "TEXT") return (m.content_text || "").slice(0, MAX_CURRENT_CHARS);
  const kind = fileKindOf(m);
  if (!kind || !m.file_path) return "";
  const buf = await readFileFn(m.file_path);
  if (!buf) return "";
  const zip = await JSZip.loadAsync(buf);
  if (kind === "SLIDES") {
    const names = Object.keys(zip.files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => Number(a.match(/(\d+)/)![1]) - Number(b.match(/(\d+)/)![1]));
    const slides: string[] = [];
    for (let i = 0; i < names.length; i++) {
      const xml = await zip.files[names[i]].async("string");
      slides.push(`Slide ${i + 1}:\n${textRuns(xml, "a:t", "a:p")}`);
    }
    return slides.join("\n\n").slice(0, MAX_CURRENT_CHARS);
  }
  const doc = zip.files["word/document.xml"];
  if (!doc) return "";
  return textRuns(await doc.async("string"), "w:t", "w:p").slice(0, MAX_CURRENT_CHARS);
}

// ---------- Requesting a draft ----------
export interface DraftRequest {
  action: AgentAction;
  instruction: string;
  moduleId?: string;
  courseId?: string;
  kind?: AgentKind;
  title?: string;
}

export async function requestDraft(
  session: SessionPayload,
  req: DraftRequest,
  deps: { provider?: AgentProvider; readFile?: (key: string) => Promise<Buffer | null> } = {}
): Promise<DraftRow> {
  const academyId = requireTenant(session);
  if (!AGENT_ACTIONS.includes(req.action)) throw new AgentError("Choose what you'd like the agent to do.");
  const instruction = clampText(req.instruction, MAX_INSTRUCTION);
  if (instruction.length < 5) throw new AgentError("Tell the agent what you'd like — a sentence is enough.");

  const academy = await Academies.byId(academyId);
  if (!academy || academy.is_deleted) throw new AgentError("Academy not found.");

  if ((await AiDrafts.countPending(academyId)) >= MAX_PENDING_PER_ACADEMY) {
    throw new AgentError("There are already a lot of drafts waiting for review. Approve or reject some before asking for more.");
  }

  // Work out the target and the context sent to the AI — all from rows that
  // belong to this academy.
  let kind: AgentKind;
  let targetModule: ModuleRow | undefined;
  let course: CourseOption | undefined;
  let currentText = "";
  let title = clampText(req.title, 140);
  let courseCtx = { title: "", description: "" };

  if (req.action === "NEW_MODULE") {
    if (!req.kind || !AGENT_KINDS.includes(req.kind)) throw new AgentError("Choose what kind of module to draft.");
    kind = req.kind;
    if (title.length < 2) throw new AgentError("Give the new module a title.");
    if (req.courseId) {
      course = await canUseCourse(session, req.courseId);
      if (!course) throw new AgentError("That course isn't available to you.");
      courseCtx = { title: course.title, description: course.description };
    }
  } else {
    if (!req.moduleId) throw new AgentError("Choose a module first.");
    targetModule = await canEditModule(session, req.moduleId);
    if (!targetModule) throw new AgentError("That module isn't available to you.");
    if (req.action === "IMPROVE_TEXT") {
      if (targetModule.content_type !== "TEXT") throw new AgentError("That module isn't a written module. Use \"Rebuild a PowerPoint / Word module\" for files.");
      kind = "TEXT";
    } else {
      const fk = fileKindOf(targetModule);
      if (!fk) throw new AgentError("Only PowerPoint (.pptx) and Word (.docx) modules can be rebuilt.");
      kind = fk;
    }
    title = targetModule.title;
    const c = await courseOfModule(academyId, targetModule.id);
    if (c) courseCtx = c;
    currentText = await extractModuleText(targetModule, deps.readFile ?? (await import("@/lib/storage")).readFile);
    if (req.action === "REBUILD_FILE" && !currentText.trim()) throw new AgentError("Couldn't read the existing file's text, so there is nothing to rebuild from.");
  }

  const ctx: ModuleContext = {
    academyName: academy.name,
    courseTitle: courseCtx.title || "(not in a course yet)",
    courseDescription: courseCtx.description || "",
    moduleTitle: title || "New module",
    moduleDescription: targetModule?.description ?? "",
    instruction,
    currentContent: currentText || undefined,
  };

  const provider = deps.provider ?? (await defaultProvider());
  const opts = { timeoutMs: REQUEST_TIMEOUT_MS };

  // The metered section: exactly one Anthropic call, counted against this
  // academy's monthly cap before it is made.
  const proposal = await withAiMeter(
    { academyId, userId: session.userId, source: "agent", label: `${ACTION_LABEL[req.action]}: ${title}`.slice(0, 120) },
    async (): Promise<Proposal> => {
      if (kind === "TEXT") {
        const out = await provider.text(ctx, opts);
        return { title: out.title || title, description: out.description || targetModule?.description || "", text: out.content };
      }
      if (kind === "SLIDES") {
        const out = await provider.slides(ctx, opts);
        return { title: title || out.deckTitle, description: targetModule?.description || out.deckTitle, slides: out };
      }
      const out = await provider.document(ctx, opts);
      return { title: title || out.title, description: targetModule?.description || out.title, document: out };
    }
  );
  // A rewrite keeps the module's own title unless the person asked otherwise
  // — the agent proposes body content, not renames.
  if (req.action !== "NEW_MODULE" && targetModule) proposal.title = targetModule.title;

  const id = newId();
  await exec(
    `INSERT INTO ai_drafts (id, academy_id, requested_by, action, instruction, target_module_id, target_course_id, kind, title, proposal_json, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING', $11)`,
    [id, academyId, session.userId, req.action, instruction, targetModule?.id ?? null, course?.id ?? null, kind, proposal.title.slice(0, 140), JSON.stringify(proposal), nowIso()]
  );
  return (await AiDrafts.byId(academyId, id))!;
}

// ---------- Approving, rejecting, restoring (the human gate) ----------
// A person may decide on a draft if they are an admin of the academy, or they
// asked for it themselves and still have access to what it touches.
async function assertCanDecide(session: SessionPayload, draft: DraftRow): Promise<void> {
  const academyId = requireTenant(session);
  if (draft.academy_id !== academyId) throw new AgentError("Draft not found.");
  if (isAdmin(session)) return;
  if (draft.requested_by !== session.userId) throw new AgentError("Only the person who asked for a draft, or an academy admin, can decide on it.");
  if (draft.target_module_id && !(await canEditModule(session, draft.target_module_id))) throw new AgentError("You no longer have access to that module.");
  if (draft.target_course_id && !(await canUseCourse(session, draft.target_course_id))) throw new AgentError("You no longer have access to that course.");
}

function parseProposal(draft: DraftRow): Proposal {
  try {
    const p = JSON.parse(draft.proposal_json) as Proposal;
    if (!p || typeof p !== "object") throw new Error("bad");
    return p;
  } catch {
    throw new AgentError("That draft is damaged — please ask the agent again.");
  }
}

async function brandingFor(academyId: string): Promise<{ academyName: string; primary: string; accent: string }> {
  const academy = await Academies.byId(academyId);
  const template = academy ? await Templates.byId(academy.template_id) : undefined;
  return { academyName: academy?.name ?? "Academy", primary: template?.primary_color ?? "#1e3a5f", accent: template?.accent_color ?? "#c9a227" };
}

async function writeFileFor(kind: FileKind, p: Proposal, academyId: string): Promise<{ file_path: string; file_name: string; file_mime: string; file_size: number }> {
  const brand = await brandingFor(academyId);
  let buf: Buffer;
  let ext: string;
  let mime: string;
  if (kind === "SLIDES") {
    if (!p.slides) throw new AgentError("That draft has no slides in it.");
    buf = await buildPptx(p.slides, { academyName: brand.academyName, primary: brand.primary, accent: brand.accent });
    ext = "pptx";
    mime = PPTX_MIME;
  } else {
    if (!p.document) throw new AgentError("That draft has no document content in it.");
    buf = await buildDocx(p.document, { academyName: brand.academyName, primary: brand.primary });
    ext = "docx";
    mime = DOCX_MIME;
  }
  const fileName = `${slugify(p.title) || "module"}.${ext}`;
  const key = `${crypto.randomUUID()}-${fileName}`;
  await saveFile(key, buf);
  return { file_path: key, file_name: fileName, file_mime: mime, file_size: buf.length };
}

/** Applies a PENDING draft. Returns the module it created or changed. */
export async function approveDraft(session: SessionPayload, draftId: string): Promise<ModuleRow> {
  const academyId = requireTenant(session);
  const draft = await AiDrafts.byId(academyId, draftId);
  if (!draft) throw new AgentError("Draft not found.");
  await assertCanDecide(session, draft);
  if (draft.status !== "PENDING") throw new AgentError("That draft has already been decided.");
  const proposal = parseProposal(draft);

  if (!(await AiDrafts.claim(academyId, draftId, "PENDING", "APPROVED", session.userId))) {
    throw new AgentError("That draft has already been decided.");
  }
  try {
    if (draft.action === "NEW_MODULE") {
      let mod: ModuleRow;
      if (draft.kind === "TEXT") {
        mod = await Modules.create({ academy_id: academyId, created_by: session.userId, title: proposal.title, description: proposal.description, content_type: "TEXT", content_text: proposal.text ?? "" });
      } else {
        const f = await writeFileFor(draft.kind as FileKind, proposal, academyId);
        mod = await Modules.create({ academy_id: academyId, created_by: session.userId, title: proposal.title, description: proposal.description, content_type: "FILE", ...f });
      }
      if (draft.target_course_id) {
        const course = await Courses.byId(draft.target_course_id);
        if (course && course.academy_id === academyId) {
          const existing = await Modules.listByCourse(course.id);
          await Modules.assignToCourse(course.id, mod.id, existing.length);
        }
      }
      await AiDrafts.finish(academyId, draftId, { result_module_id: mod.id });
      return mod;
    }

    // Edits of an existing module: re-check it still exists in this academy.
    const target = draft.target_module_id ? await canEditModule(session, draft.target_module_id) : undefined;
    if (!target) throw new AgentError("The module this draft was written for no longer exists.");

    if (draft.action === "IMPROVE_TEXT") {
      if (target.content_type !== "TEXT") throw new AgentError("That module is no longer a written module.");
      const prev: TextPrevious = { title: target.title, description: target.description, content_text: target.content_text };
      const updated = await Modules.update(target.id, { description: proposal.description || target.description, content_text: proposal.text ?? target.content_text });
      await AiDrafts.finish(academyId, draftId, { previous_json: JSON.stringify(prev), result_module_id: target.id });
      return updated!;
    }

    // REBUILD_FILE: write the new file first, then point the module at it. The
    // old file is left in storage so the change can be undone.
    const fk = fileKindOf(target);
    if (!fk || fk !== draft.kind) throw new AgentError("That module's file type has changed since the draft was made.");
    const prev: FilePrevious = { file_path: target.file_path, file_name: target.file_name, file_mime: target.file_mime, file_size: target.file_size, title: target.title, description: target.description };
    const f = await writeFileFor(fk, proposal, academyId);
    const updated = await Modules.update(target.id, { ...f, description: proposal.description || target.description });
    await AiDrafts.finish(academyId, draftId, { previous_json: JSON.stringify(prev), result_module_id: target.id });
    return updated!;
  } catch (err) {
    await AiDrafts.release(academyId, draftId, "PENDING").catch(() => {});
    throw err;
  }
}

export async function rejectDraft(session: SessionPayload, draftId: string): Promise<void> {
  const academyId = requireTenant(session);
  const draft = await AiDrafts.byId(academyId, draftId);
  if (!draft) throw new AgentError("Draft not found.");
  await assertCanDecide(session, draft);
  if (!(await AiDrafts.claim(academyId, draftId, "PENDING", "REJECTED", session.userId))) {
    throw new AgentError("That draft has already been decided.");
  }
}

/** Puts an approved edit back to how the module was before. */
export async function restoreDraft(session: SessionPayload, draftId: string): Promise<void> {
  const academyId = requireTenant(session);
  const draft = await AiDrafts.byId(academyId, draftId);
  if (!draft) throw new AgentError("Draft not found.");
  await assertCanDecide(session, draft);
  if (draft.action === "NEW_MODULE" || draft.status !== "APPROVED" || !draft.previous_json || !draft.target_module_id) {
    throw new AgentError("This change can't be restored.");
  }
  const target = await canEditModule(session, draft.target_module_id);
  if (!target) throw new AgentError("The module no longer exists.");
  if (!(await AiDrafts.claim(academyId, draftId, "APPROVED", "RESTORED", session.userId))) {
    throw new AgentError("That change has already been restored.");
  }
  try {
    if (draft.action === "IMPROVE_TEXT") {
      const prev = JSON.parse(draft.previous_json) as TextPrevious;
      await Modules.update(target.id, { description: prev.description, content_text: prev.content_text });
    } else {
      const prev = JSON.parse(draft.previous_json) as FilePrevious;
      await Modules.update(target.id, { file_path: prev.file_path, file_name: prev.file_name, file_mime: prev.file_mime, file_size: prev.file_size, description: prev.description });
    }
  } catch (err) {
    await AiDrafts.release(academyId, draftId, "APPROVED").catch(() => {});
    throw err;
  }
}

export { getAiUsage };
