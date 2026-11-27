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
import type { ModuleKind } from "@/lib/moduleContent";
import { meteredCall } from "@/lib/aiUsage";
import { COURSE_TYPES, COURSE_LEVELS, normalizeCourseType, normalizeLevel, normalizeHours, type CourseType, type CourseLevel } from "@/lib/courseTypes";
import { DEFAULT_LANG, languageInstruction, type Lang } from "@/lib/i18n";

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
  // Which of the academy's three course types this belongs to, how hard it is,
  // and roughly how many hours of study it takes (0 = work it out from modules).
  courseType: CourseType;
  level: CourseLevel;
  studyHours: number;
  // The AI no longer plans modules (the academy admin or instructors add them,
  // by hand or with the content agent); only tests and the build queue still use this.
  modules?: AcademyPlanModule[];
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
  // 'What you'll learn' points for the homepage (up to 6 short lines).
  learningOutcomes: string[];
  template: AcademyPlanTemplate;
  homepageBlocks: AcademyPlanBlock[];
  courses: AcademyPlanCourse[];
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const ALLOWED_FONTS = ["Inter", "Poppins", "Montserrat", "Playfair Display", "Georgia", "Arial"];
const MAX_COURSES = 6;
// Netlify cuts a request off at ~30s, so the one planning call must fit inside that.
export const PLAN_TIMEOUT_MS = 25_000;

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
      return {
        title,
        description,
        category,
        courseType: normalizeCourseType(cc.courseType),
        level: normalizeLevel(cc.level),
        studyHours: normalizeHours(cc.studyHours),
      };
    })
    .filter((c): c is AcademyPlanCourse => c !== null);

  return {
    academyName,
    slugSuggestion: slugifyLoose(clampText(r.slugSuggestion, 60) || academyName),
    heroHeadline: clampText(r.heroHeadline, 150, academyName),
    heroTagline: clampText(r.heroTagline, 200, ""),
    // The public page is headline, tagline and courses only; About, "What you'll learn" and other sections are added by the admin.
    aboutText: "",
    learningOutcomes: [],
    template: {
      name: clampText(t.name, 60, `${academyName} Theme`),
      description: clampText(t.description, 200, "AI-generated template"),
      primary_color: primary,
      secondary_color: secondary,
      accent_color: accent,
      font_heading: font,
    },
    homepageBlocks: [],
    courses,
  };
}

const PLAN_TOOL_NAME = "create_academy_plan";

const PLAN_TOOL: Anthropic.Tool = {
  name: PLAN_TOOL_NAME,
  description:
    "Propose the starter setup for a new training academy — its name, brand colours, headline, tagline and courses — based on the admin's plain-language description of their organisation and what they teach. Courses only: modules and lesson content are added later by the academy's own team.",
  input_schema: {
    type: "object",
    properties: {
      academyName: { type: "string", description: "A short, professional organisation/academy name." },
      slugSuggestion: { type: "string", description: "A lowercase, hyphenated web-address slug for this academy, derived from the name." },
      heroHeadline: { type: "string", description: "A short, punchy headline for the academy's public homepage (under ~10 words)." },
      heroTagline: { type: "string", description: "A one-sentence supporting tagline under the headline." },
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
      courses: {
        type: "array",
        description: `Between 3 and ${MAX_COURSES} courses that fit what this academy teaches. Do NOT plan modules or lessons — only the courses themselves.`,
        maxItems: MAX_COURSES,
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string", description: "One or two sentences on what a learner gets from the course." },
            category: { type: "string", description: "A short topic label, e.g. 'Compliance'." },
            courseType: {
              type: "string",
              enum: [...COURSE_TYPES],
              description:
                "SELF_PACED = free or self-paced training learners take on their own; CERTIFICATION = a certification pathway that builds towards a credential; INSTRUCTOR_LED = a course or training run with a live instructor. Use SELF_PACED unless the admin asked for the others; use a sensible mix when the description suggests it.",
            },
            level: { type: "string", enum: [...COURSE_LEVELS], description: "Who the course is for: BEGINNER, INTERMEDIATE or ADVANCED." },
            studyHours: { type: "number", description: "Realistic total hours of study for a learner, e.g. 6 or 30 (a whole number or a half)." },
          },
          required: ["title", "description", "category", "courseType", "level", "studyHours"],
        },
      },
    },
    required: ["academyName", "slugSuggestion", "heroHeadline", "heroTagline", "template", "courses"],
  },
};

// Throws on any failure (no key, API error, malformed response) — callers
// (lib/actions/aiAcademy.ts) catch this and return a generic user-facing
// error, logging the real cause server-side, exactly the same pattern
// lib/actions/billing.ts uses for Stripe failures.
export async function generateAcademyPlan(prompt: string, language: Lang = DEFAULT_LANG): Promise<AcademyPlan> {
  const client = getAnthropicClient();
  if (!client) throw new Error("AI generation is not configured (no ANTHROPIC_API_KEY).");

  // Must finish well inside Netlify's 60-second function cap, otherwise the
  // browser gets a bare gateway error instead of anything we can explain.
  // So: a hard 42s client timeout, no automatic retry (a retry would just
  // burn the rest of the budget), and a modest output ceiling.
  const message = await meteredCall(() => client.messages.create(
    {
    model: modelName(),
    max_tokens: 2500,
    system:
      "You help a new training-academy administrator turn a short description of their organisation into a starter academy setup: a name, brand colours, a headline, a tagline and the courses the academy offers. Always call the create_academy_plan tool exactly once with your full proposal — never reply in plain text. Keep copy professional and concise. Colours must be a coherent, professional brand palette (not neon, not pure #FFFFFF/#000000). Plan only the courses: never plan modules, lessons, slides or any lesson content — the academy's administrators and instructors add those themselves afterwards. Give each course a type (self-paced, certification pathway or instructor-led), a level and a realistic number of study hours. Be brief so the answer is fast: normally 3-5 courses, one short sentence per description." + languageInstruction(language),
    messages: [{ role: "user", content: prompt }],
    tools: [PLAN_TOOL],
    tool_choice: { type: "tool", name: PLAN_TOOL_NAME },
    },
    { timeout: PLAN_TIMEOUT_MS, maxRetries: 0 },
  ));

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
