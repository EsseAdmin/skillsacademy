// Second AI step: once a plan's outline is approved, each SLIDES / DOCUMENT /
// SCORM / VIDEO module gets its real lesson content written by a small,
// focused Anthropic call (one per module — far more reliable, and far
// faster per call, than asking for every module's full content in the
// outline request). The structured result is validated by the sanitisers in
// lib/moduleContent.ts and turned into actual files by lib/generators/*.
//
// Same ground rules as lib/ai.ts: forced tool use (no free-text parsing),
// everything model-supplied is untrusted, and callers (lib/aiModuleBuild.ts)
// treat any throw as "fall back to a text draft" rather than failing the
// whole plan.
import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, modelName } from "@/lib/ai";
import {
  LIMITS,
  sanitizeDocument,
  sanitizeScorm,
  sanitizeSlides,
  sanitizeVideoBrief,
  type DocumentContent,
  type ScormContent,
  type SlidesContent,
  type VideoBriefContent,
} from "@/lib/moduleContent";

export interface ModuleContext {
  academyName: string;
  courseTitle: string;
  courseDescription: string;
  moduleTitle: string;
  moduleDescription: string;
}

const str = (description: string) => ({ type: "string" as const, description });
const strList = (description: string, maxItems: number) => ({ type: "array" as const, maxItems, items: { type: "string" as const }, description });

const SLIDES_TOOL: Anthropic.Tool = {
  name: "write_slide_deck",
  description: "Write the slides for one training module's PowerPoint deck.",
  input_schema: {
    type: "object",
    properties: {
      deckTitle: str("Title for the deck."),
      slides: {
        type: "array",
        maxItems: LIMITS.maxSlides,
        description: `6 to ${LIMITS.maxSlides} content slides in teaching order (do not include a separate title slide).`,
        items: {
          type: "object",
          properties: {
            title: str("Short slide title."),
            bullets: strList("3-5 concise bullet points, each under ~20 words.", LIMITS.maxBulletsPerSlide),
            notes: str("2-4 sentences of speaker notes the instructor can read out."),
          },
          required: ["title", "bullets", "notes"],
        },
      },
    },
    required: ["deckTitle", "slides"],
  },
};

const DOC_TOOL: Anthropic.Tool = {
  name: "write_handout",
  description: "Write one training module's Word handout / learner guide.",
  input_schema: {
    type: "object",
    properties: {
      title: str("Document title."),
      intro: str("A short introductory paragraph."),
      sections: {
        type: "array",
        maxItems: LIMITS.maxSections,
        description: "4 to 8 sections in logical order.",
        items: {
          type: "object",
          properties: {
            heading: str("Section heading."),
            paragraphs: strList("1-3 clear explanatory paragraphs.", 5),
            bullets: strList("Optional key points or steps.", 8),
          },
          required: ["heading", "paragraphs", "bullets"],
        },
      },
    },
    required: ["title", "intro", "sections"],
  },
};

const EXERCISES_TOOL: Anthropic.Tool = {
  name: "write_exercises",
  description:
    "Write the Word exercise sheet that accompanies one training module's PowerPoint: practical activities learners complete after working through the slides.",
  input_schema: {
    type: "object",
    properties: {
      title: str("Document title, e.g. 'Exercises: <module topic>'."),
      intro: str("A short paragraph telling learners what to do and roughly how long it takes."),
      sections: {
        type: "array",
        maxItems: LIMITS.maxSections,
        description:
          "4 to 6 numbered exercises (heading like 'Exercise 1: ...') that apply the module's content in realistic workplace situations, mixing question types (short answer, scenario, apply-it, checklist), followed by one final 'Reflection' section. Practical and specific to the topic.",
        items: {
          type: "object",
          properties: {
            heading: str("Exercise heading, e.g. 'Exercise 2: Spot the risk'."),
            paragraphs: strList("The task or scenario, written so a learner can complete it without further help.", 3),
            bullets: strList("Optional steps, prompts or a self-check list for the learner.", 6),
          },
          required: ["heading", "paragraphs", "bullets"],
        },
      },
    },
    required: ["title", "intro", "sections"],
  },
};

const SCORM_TOOL: Anthropic.Tool = {
  name: "write_elearning_lesson",
  description: "Write one short interactive e-learning lesson (a few pages plus a self-check quiz) to be packaged as SCORM.",
  input_schema: {
    type: "object",
    properties: {
      title: str("Lesson title."),
      pages: {
        type: "array",
        maxItems: LIMITS.maxScormPages,
        description: "3 to 6 lesson pages in teaching order.",
        items: {
          type: "object",
          properties: {
            heading: str("Page heading."),
            paragraphs: strList("1-3 short paragraphs of teaching content.", 4),
            bullets: strList("Optional key points.", 8),
          },
          required: ["heading", "paragraphs", "bullets"],
        },
      },
      questions: {
        type: "array",
        maxItems: LIMITS.maxScormQuestions,
        description: "3 to 5 multiple-choice self-check questions testing the lesson content.",
        items: {
          type: "object",
          properties: {
            question: str("The question."),
            options: strList("2 to 4 answer options.", LIMITS.maxOptions),
            correctIndex: { type: "integer", description: "Zero-based index of the single correct option." },
            explanation: str("One sentence explaining the correct answer."),
          },
          required: ["question", "options", "correctIndex", "explanation"],
        },
      },
      passMarkPct: { type: "integer", description: "Pass mark percentage, normally 70." },
    },
    required: ["title", "pages", "questions", "passMarkPct"],
  },
};

const VIDEO_TOOL: Anthropic.Tool = {
  name: "write_video_script",
  description: "Write a short script/brief for one training video lesson that the academy will record themselves.",
  input_schema: {
    type: "object",
    properties: {
      script: str("A scene-by-scene script or talking-points outline, 150-350 words, in plain text."),
      durationMinutes: { type: "integer", description: "Suggested running time in minutes (2-10)." },
    },
    required: ["script", "durationMinutes"],
  },
};

const TOOL_BY_KIND = { SLIDES: SLIDES_TOOL, DOCUMENT: DOC_TOOL, EXERCISES: EXERCISES_TOOL, SCORM: SCORM_TOOL, VIDEO: VIDEO_TOOL } as const;
export type GeneratedKind = keyof typeof TOOL_BY_KIND;

const SYSTEM =
  "You are an instructional designer writing real, accurate, practical training content for a company's learners. Always call the provided tool exactly once — never reply in plain text. Write in clear, professional UK English. Stay strictly on the module's topic. Do not include URLs, links, or references to specific external websites or documents you cannot be sure exist. Do not claim to be an official source of legal, medical or safety certification.";

async function callTool(kind: GeneratedKind, ctx: ModuleContext, opts: { timeoutMs: number }): Promise<unknown> {
  const client = getAnthropicClient();
  if (!client) throw new Error("AI generation is not configured (no ANTHROPIC_API_KEY).");
  const tool = TOOL_BY_KIND[kind];
  const message = await client.messages.create(
    {
      model: modelName(),
      max_tokens: kind === "SCORM" ? 3500 : kind === "VIDEO" ? 1200 : kind === "EXERCISES" ? 2500 : 3000,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Academy: ${ctx.academyName}\nCourse: ${ctx.courseTitle} — ${ctx.courseDescription}\nModule: ${ctx.moduleTitle}\nModule outline: ${ctx.moduleDescription}\n\nWrite the content for this module now.`,
        },
      ],
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
    },
    // No retries and a hard per-call timeout: the whole plan has to finish
    // inside one serverless request, so a slow/failed call should fall back
    // to a text draft quickly rather than hold everything up.
    { timeout: opts.timeoutMs, maxRetries: 0 }
  );
  const block = message.content.find((b) => b.type === "tool_use" && b.name === tool.name);
  if (!block || block.type !== "tool_use") throw new Error(`AI response did not include ${tool.name}.`);
  return block.input;
}

export async function generateSlides(ctx: ModuleContext, opts: { timeoutMs: number }): Promise<SlidesContent> {
  const out = sanitizeSlides(await callTool("SLIDES", ctx, opts), ctx.moduleTitle);
  if (!out) throw new Error("AI slide content was empty or invalid.");
  return out;
}
export async function generateDocument(ctx: ModuleContext, opts: { timeoutMs: number }): Promise<DocumentContent> {
  const out = sanitizeDocument(await callTool("DOCUMENT", ctx, opts), ctx.moduleTitle);
  if (!out) throw new Error("AI document content was empty or invalid.");
  return out;
}
export async function generateExercises(ctx: ModuleContext, opts: { timeoutMs: number }): Promise<DocumentContent> {
  const out = sanitizeDocument(await callTool("EXERCISES", ctx, opts), `Exercises: ${ctx.moduleTitle}`);
  if (!out) throw new Error("AI exercise content was empty or invalid.");
  return out;
}
export async function generateScorm(ctx: ModuleContext, opts: { timeoutMs: number }): Promise<ScormContent> {
  const out = sanitizeScorm(await callTool("SCORM", ctx, opts), ctx.moduleTitle);
  if (!out) throw new Error("AI e-learning content was empty or invalid.");
  return out;
}
export async function generateVideoBrief(ctx: ModuleContext, opts: { timeoutMs: number }): Promise<VideoBriefContent> {
  const out = sanitizeVideoBrief(await callTool("VIDEO", ctx, opts));
  if (!out) throw new Error("AI video script was empty or invalid.");
  return out;
}
