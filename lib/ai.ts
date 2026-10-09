// AI academy generation — turns one text prompt into a structured
// "academy plan" (branding + homepage copy + a starter course/module
// outline) via the Anthropic API. Follows the exact same graceful-
// degradation pattern as lib/stripe.ts and lib/email.ts: this app must
// keep working with no ANTHROPIC_API_KEY configured, returning a clear
// "not set up yet" state instead of crashing.
//
// This module only ever *generates* a plan and validates/sanitises it.
// Turning a plan into real database rows (a template, homepage content
// blocks, courses and modules) is lib/aiAcademyPlan.ts's job — kept
// separate so the Anthropic API call and the DB-writing logic can each be
// reasoned about (and reused) independently. Two very different callers
// reuse this: the public /signup wizard (no academy exists yet) and the
// tenant admin dashboard's "Generate with AI" page (academy already
// exists) — see lib/actions/signup.ts and lib/actions/aiAcademy.ts.
import Anthropic from "@anthropic-ai/sdk";
import { MODULE_KINDS, type ModuleKind } from "@/lib/moduleContent";
import { safeHttpUrl } from "@/lib/safeUrl";

export function isAiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

// Deliberately not cached across calls, same reasoning as
// lib/stripe.ts's getStripeClient() — adding the key shouldn't require
// remembering to clear some in-memory client cache.
export function getAnthropicClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

// "claude-sonnet-5" is a real, current model id as of when this was
// written — confirmed against the installed @anthropic-ai/sdk's own
// Model type union, not guessed. Model names do change over time though,
// so this is overridable via an env var (no code change/redeploy needed
// beyond setting it) if it ever needs updating — check
// https://docs.claude.com for the current model list if generation starts
// failing with a "model not found"-shaped error.
const DEFAULT_MODEL = "claude-sonnet-5";
export function modelName(): string {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}

export interface AcademyPlanModule {
  title: string;
  description: string;
  // What kind of content this module should hold. SLIDES / DOCUMENT /
  // SCORM / VIDEO are turned into real PowerPoint / Word / SCORM-package /
  // video-brief content when the plan is applied (lib/aiModuleBuild.ts);
  // TEXT is a written outline; URL is an external link.
  kind: ModuleKind;
  // Only ever a link the admin themselves typed into their request (see
  // keepOnlyPromptUrls) — the model is never allowed to invent one.
  url?: string;
  // True when applying the plan should also write a Word "Exercises" sheet
  // for this module (an extra module right after it). Always true for
  // PowerPoint modules unless the rich-module cap had no room for it — it is
  // derived by sanitizeAcademyPlan, never taken from the model or the form.
  exercises?: boolean;
}
export interface AcademyPlanCourse {
  title: string;
  description: string;
  category: string;
  modules: AcademyPlanModule[];
}
export interface AcademyPlanBlock {
  block_type: "TEXT" | "NEWS";
  title: string;
  body_text: string;
}
export interface AcademyPlanTemplate {
  name: string;
  description: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  font_heading: string;
}
export interface AcademyPlan {
  academyName: string;
  slugSuggestion: string;
  heroHeadline: string;
  heroTagline: string;
  aboutText: string;
  template: AcademyPlanTemplate;
  homepageBlocks: AcademyPlanBlock[];
  courses: AcademyPlanCourse[];
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const ALLOWED_FONTS = ["Inter", "Poppins", "Montserrat", "Playfair Display", "Georgia", "Arial"];
const MAX_COURSES = 2;
const MAX_MODULES_PER_COURSE = 3;
const MAX_HOMEPAGE_BLOCKS = 3;
// Generating a real PowerPoint / Word file / SCORM package / video script
// costs one extra AI call per module, and applying a plan has to finish
// inside a single serverless request (60s on Netlify) — so only this many
// modules per plan can be AI-built rich content; any beyond it become plain
// text outlines the admin can flesh out (or replace with an upload) later.
// Every PowerPoint module also gets a Word exercises sheet, so it costs two
// of these: 8 means four full topics (four decks + four exercise sheets).
export const MAX_RICH_MODULES = 8;
export const PLAN_TIMEOUT_MS = 42_000;
const RICH_KINDS: ModuleKind[] = ["SLIDES", "DOCUMENT", "SCORM", "VIDEO"];

function clampText(value: unknown, maxLen: number, fallback = ""): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) return fallback;
  return s.length > maxLen ? s.slice(0, maxLen).trim() : s;
}

function slugifyLoose(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Cap how many modules across the whole plan get AI-built rich content;
// later ones quietly fall back to TEXT so the preview shows exactly what
// will be created. A VIDEO module that already carries the admin's own link
// needs no AI call, so it doesn't count.
function capRichModules(courses: AcademyPlanCourse[]): void {
  let richCount = 0;
  for (const course of courses) {
    for (const m of course.modules) {
      if (m.kind === "SLIDES") m.exercises = true;
      if (!RICH_KINDS.includes(m.kind)) {
        delete m.exercises;
        continue;
      }
      if (m.kind === "VIDEO" && m.url) continue;
      const cost = m.exercises ? 2 : 1;
      if (richCount + cost <= MAX_RICH_MODULES) {
        richCount += cost;
      } else if (m.exercises && richCount + 1 <= MAX_RICH_MODULES) {
        // Room for the deck but not its exercise sheet.
        delete m.exercises;
        richCount += 1;
      } else {
        m.kind = "TEXT";
        delete m.exercises;
      }
    }
  }
}

// Re-validates and clamps a plan regardless of where it came from — a
// fresh tool-use response from Claude, or JSON round-tripped through a
// hidden form field after an admin reviewed (and could have hand-edited)
// it in the browser. Never trust either source blindly: hex colours are
// checked against the same pattern the manual "create custom template"
// form already enforces (lib/actions/settings.ts), the heading font is
// checked against the same fixed option list the Branding page's <select>
// offers, and every array is capped so a malformed or adversarial payload
// can't fan out into hundreds of courses/modules/rows. Returns null if
// the plan is too malformed to use at all (e.g. missing colours).
export function sanitizeAcademyPlan(raw: unknown): AcademyPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const t = (r.template && typeof r.template === "object" ? r.template : {}) as Record<string, unknown>;

  const primary = typeof t.primary_color === "string" && HEX_COLOR_RE.test(t.primary_color) ? t.primary_color : null;
  const secondary = typeof t.secondary_color === "string" && HEX_COLOR_RE.test(t.secondary_color) ? t.secondary_color : null;
  const accent = typeof t.accent_color === "string" && HEX_COLOR_RE.test(t.accent_color) ? t.accent_color : null;
  if (!primary || !secondary || !accent) return null;

  const academyName = clampText(r.academyName, 80);
  if (!academyName) return null;

  const font = typeof t.font_heading === "string" && ALLOWED_FONTS.includes(t.font_heading) ? t.font_heading : "Inter";

  const homepageBlocksRaw = Array.isArray(r.homepageBlocks) ? r.homepageBlocks : [];
  const homepageBlocks: AcademyPlanBlock[] = homepageBlocksRaw
    .slice(0, MAX_HOMEPAGE_BLOCKS)
    .map((b): AcademyPlanBlock | null => {
      if (!b || typeof b !== "object") return null;
      const bb = b as Record<string, unknown>;
      const title = clampText(bb.title, 120);
      const body_text = clampText(bb.body_text, 2000);
      if (!title || !body_text) return null;
      const block_type = bb.block_type === "NEWS" ? "NEWS" : "TEXT";
      return { block_type, title, body_text };
    })
    .filter((b): b is AcademyPlanBlock => b !== null);

  const coursesRaw = Array.isArray(r.courses) ? r.courses : [];
  const courses: AcademyPlanCourse[] = coursesRaw
    .slice(0, MAX_COURSES)
    .map((c): AcademyPlanCourse | null => {
      if (!c || typeof c !== "object") return null;
      const cc = c as Record<string, unknown>;
      const title = clampText(cc.title, 120);
      if (!title) return null;
      const description = clampText(cc.description, 2000, "A starter course outline — add real content in the course editor.");
      const category = clampText(cc.category, 60, "General");
      const modulesRaw = Array.isArray(cc.modules) ? cc.modules : [];
      const modules: AcademyPlanModule[] = modulesRaw
        .slice(0, MAX_MODULES_PER_COURSE)
        .map((m): AcademyPlanModule | null => {
          if (!m || typeof m !== "object") return null;
          const mm = m as Record<string, unknown>;
          const mTitle = clampText(mm.title, 120);
          if (!mTitle) return null;
          const mDescription = clampText(mm.description, 2000, "Outline this module's content here.");
          const kind: ModuleKind = MODULE_KINDS.includes(mm.kind as ModuleKind) ? (mm.kind as ModuleKind) : "TEXT";
          // Links only make sense on URL and VIDEO modules, and must be plain
          // http(s) — they end up in an href/iframe on learner pages.
          const url = kind === "URL" || kind === "VIDEO" ? safeHttpUrl(mm.url) ?? undefined : undefined;
          return { title: mTitle, description: mDescription, kind, ...(url ? { url } : {}), ...(kind === "SLIDES" ? { exercises: true } : {}) };
        })
        .filter((m): m is AcademyPlanModule => m !== null);
      if (modules.length === 0) return null;
      return { title, description, category, modules };
    })
    .filter((c): c is AcademyPlanCourse => c !== null);

  capRichModules(courses);

  return {
    academyName,
    slugSuggestion: slugifyLoose(clampText(r.slugSuggestion, 60) || academyName),
    heroHeadline: clampText(r.heroHeadline, 150, academyName),
    heroTagline: clampText(r.heroTagline, 200, ""),
    aboutText: clampText(r.aboutText, 2000, ""),
    template: {
      name: clampText(t.name, 60, `${academyName} Theme`),
      description: clampText(t.description, 200, "AI-generated template"),
      primary_color: primary,
      secondary_color: secondary,
      accent_color: accent,
      font_heading: font,
    },
    homepageBlocks,
    courses,
  };
}

const PLAN_TOOL_NAME = "create_academy_plan";

const PLAN_TOOL: Anthropic.Tool = {
  name: PLAN_TOOL_NAME,
  description:
    "Propose a complete starter setup for a new training academy, based on the admin's plain-language description of their organisation and what they teach.",
  input_schema: {
    type: "object",
    properties: {
      academyName: { type: "string", description: "A short, professional organisation/academy name." },
      slugSuggestion: { type: "string", description: "A lowercase, hyphenated web-address slug for this academy, derived from the name." },
      heroHeadline: { type: "string", description: "A short, punchy headline for the academy's public homepage (under ~10 words)." },
      heroTagline: { type: "string", description: "A one-sentence supporting tagline under the headline." },
      aboutText: { type: "string", description: "A short 'About' paragraph (2-4 sentences) for the academy's public homepage." },
      template: {
        type: "object",
        description: "A colour/font theme that fits the vibe and sector described — a real, professional-looking brand palette, not neon or pure black/white.",
        properties: {
          name: { type: "string", description: "A short name for this colour theme, e.g. 'Calm Teal'." },
          description: { type: "string", description: "One short sentence describing the theme." },
          primary_color: { type: "string", description: "Main brand colour as a 6-digit hex code, e.g. #0B1F3B." },
          secondary_color: { type: "string", description: "A complementary secondary colour as a 6-digit hex code." },
          accent_color: { type: "string", description: "A contrasting accent colour (for buttons/highlights) as a 6-digit hex code." },
          font_heading: { type: "string", enum: ALLOWED_FONTS, description: "Heading font — pick whichever of these options best fits the tone." },
        },
        required: ["name", "description", "primary_color", "secondary_color", "accent_color", "font_heading"],
      },
      homepageBlocks: {
        type: "array",
        description: `Up to ${MAX_HOMEPAGE_BLOCKS} homepage content sections (a mix of TEXT and NEWS blocks) that introduce the academy.`,
        maxItems: MAX_HOMEPAGE_BLOCKS,
        items: {
          type: "object",
          properties: {
            block_type: { type: "string", enum: ["TEXT", "NEWS"] },
            title: { type: "string" },
            body_text: { type: "string", description: "1-3 short paragraphs." },
          },
          required: ["block_type", "title", "body_text"],
        },
      },
      courses: {
        type: "array",
        description: `Up to ${MAX_COURSES} starter courses that fit what this academy teaches, each with a short module outline (titles, a format, and 1-2 sentence descriptions only — the full slide/handout/package content is written in a later step). Keep the whole plan to at most ${MAX_RICH_MODULES / 2} modules in total: every SLIDES module is automatically delivered as a PowerPoint deck plus a Word exercise sheet, and the platform can only build that many per request.`,
        maxItems: MAX_COURSES,
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            category: { type: "string" },
            modules: {
              type: "array",
              maxItems: MAX_MODULES_PER_COURSE,
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string", description: "A short outline of what this module should cover, not full content." },
                  kind: {
                    type: "string",
                    enum: MODULE_KINDS,
                    description:
                      "The format of this module. SLIDES = a PowerPoint deck; DOCUMENT = a Word handout/guide; SCORM = an interactive e-learning package with a short self-check quiz; VIDEO = a video lesson (a script is drafted for the admin to record or replace); URL = a link to an external web page; TEXT = a plain written lesson. Default to SLIDES for every module (each gets a PowerPoint deck and a Word exercise sheet generated automatically); only use another format when the admin asked for it.",
                  },
                  url: {
                    type: "string",
                    description:
                      "ONLY for URL or VIDEO modules, and ONLY if the admin typed this exact web address in their request. Never invent, guess or recall a URL — leave this out entirely if the admin did not provide one.",
                  },
                },
                required: ["title", "description", "kind"],
              },
            },
          },
          required: ["title", "description", "category", "modules"],
        },
      },
    },
    required: ["academyName", "slugSuggestion", "heroHeadline", "heroTagline", "aboutText", "template", "homepageBlocks", "courses"],
  },
};

// Throws on any failure (no key, API error, malformed response) — callers
// (lib/actions/aiAcademy.ts) catch this and return a generic user-facing
// error, logging the real cause server-side, exactly the same pattern
// lib/actions/billing.ts uses for Stripe failures.
export async function generateAcademyPlan(prompt: string): Promise<AcademyPlan> {
  const client = getAnthropicClient();
  if (!client) throw new Error("AI generation is not configured (no ANTHROPIC_API_KEY).");

  // Must finish well inside Netlify's 60-second function cap, otherwise the
  // browser gets a bare gateway error instead of anything we can explain.
  // So: a hard 42s client timeout, no automatic retry (a retry would just
  // burn the rest of the budget), and a modest output ceiling.
  const message = await client.messages.create(
    {
    model: modelName(),
    max_tokens: 3500,
    system:
      "You help a new training-academy administrator turn a short description of their organisation into a starter academy setup. Always call the create_academy_plan tool exactly once with your full proposal — never reply in plain text. Keep copy professional and concise. Colours must be a coherent, professional brand palette (not neon, not pure #FFFFFF/#000000). Course/module descriptions are short outlines only, never full lesson content. Give every module a format (kind): every module defaults to SLIDES (the platform automatically generates a PowerPoint for it plus a Word exercise sheet, so never plan separate exercise modules); if the admin explicitly wants a module as Word/handout/guide/document use DOCUMENT, SCORM/interactive/e-learning package use SCORM, video use VIDEO, and website/link/resource page use URL. Only put a url on a module if the admin typed that exact address in their request — never make one up. Be brief so the answer is fast: normally 1-2 courses with 2-3 modules each (at most 4 modules in total), one short sentence per description, and at most 3 homepage sections.",
    messages: [{ role: "user", content: prompt }],
    tools: [PLAN_TOOL],
    tool_choice: { type: "tool", name: PLAN_TOOL_NAME },
    },
    { timeout: PLAN_TIMEOUT_MS, maxRetries: 0 },
  );

  const toolUse = message.content.find((block) => block.type === "tool_use" && block.name === PLAN_TOOL_NAME);
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("AI response did not include the expected academy plan.");
  }

  const sanitized = sanitizeAcademyPlan(toolUse.input);
  if (!sanitized) {
    throw new Error("AI response could not be turned into a valid academy plan.");
  }
  keepOnlyPromptUrls(sanitized, prompt);
  return sanitized;
}

// Models can "remember" plausible-looking links that don't exist or point
// somewhere unexpected, so any module link must literally appear in what the
// admin typed. The prompt tells the model the same, but this is the actual
// guarantee: a module whose link wasn't in the prompt keeps its kind (a URL
// module is created empty, ready for the admin to paste a link; a VIDEO
// module gets a script instead) but loses the link itself.
export function keepOnlyPromptUrls(plan: AcademyPlan, prompt: string): void {
  const normalise = (u: string): string | null => {
    const safe = safeHttpUrl(u.replace(/[.,;:!?)\]}'"]+$/, ""));
    return safe ? safe.replace(/\/$/, "") : null;
  };
  const typed = new Set<string>();
  for (const m of prompt.match(/https?:\/\/[^\s<>"]+/gi) ?? []) {
    const n = normalise(m);
    if (n) typed.add(n);
  }
  for (const course of plan.courses) {
    for (const mod of course.modules) {
      if (!mod.url) continue;
      const n = normalise(mod.url);
      if (n && typed.has(n)) mod.url = n;
      else delete mod.url;
    }
  }
  // Modules that just lost their link may now need an AI call after all.
  capRichModules(plan.courses);
}
