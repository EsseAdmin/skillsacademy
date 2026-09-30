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

export function isAiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

// Deliberately not cached across calls, same reasoning as
// lib/stripe.ts's getStripeClient() — adding the key shouldn't require
// remembering to clear some in-memory client cache.
function getAnthropicClient(): Anthropic | null {
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
function modelName(): string {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}

export interface AcademyPlanModule {
  title: string;
  description: string;
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
const MAX_COURSES = 4;
const MAX_MODULES_PER_COURSE = 6;
const MAX_HOMEPAGE_BLOCKS = 4;

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
          return { title: mTitle, description: mDescription };
        })
        .filter((m): m is AcademyPlanModule => m !== null);
      if (modules.length === 0) return null;
      return { title, description, category, modules };
    })
    .filter((c): c is AcademyPlanCourse => c !== null);

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
        description: `Up to ${MAX_COURSES} starter courses that fit what this academy teaches, each with a short module outline (titles + 1-2 sentence descriptions only — not full lesson content, the admin writes that themselves afterward).`,
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
                },
                required: ["title", "description"],
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

  const message = await client.messages.create({
    model: modelName(),
    max_tokens: 4096,
    system:
      "You help a new training-academy administrator turn a short description of their organisation into a starter academy setup. Always call the create_academy_plan tool exactly once with your full proposal — never reply in plain text. Keep copy professional and concise. Colours must be a coherent, professional brand palette (not neon, not pure #FFFFFF/#000000). Course/module descriptions are short outlines only, never full lesson content.",
    messages: [{ role: "user", content: prompt }],
    tools: [PLAN_TOOL],
    tool_choice: { type: "tool", name: PLAN_TOOL_NAME },
  });

  const toolUse = message.content.find((block) => block.type === "tool_use" && block.name === PLAN_TOOL_NAME);
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("AI response did not include the expected academy plan.");
  }

  const sanitized = sanitizeAcademyPlan(toolUse.input);
  if (!sanitized) {
    throw new Error("AI response could not be turned into a valid academy plan.");
  }
  return sanitized;
}
