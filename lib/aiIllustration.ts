// AI-designed illustrations for courses and modules. Claude draws a flat vector
// picture (SVG) for the topic in the academy's colours; the drawing is rebuilt
// through lib/svgSafe.ts (allow-list only) and then stored exactly like an
// uploaded picture, so every place that shows a cover or module picture shows it
// with no extra code. With no API key, or if the call fails, nothing changes and
// the topic-matched default picture (components/CourseArt.tsx) stays.
import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "@/lib/ai";
import { meteredCall } from "@/lib/aiUsage";
import { sanitizeSvg } from "@/lib/svgSafe";
import type { CourseType } from "@/lib/courseTypes";

export interface IllustrationRequest {
  kind: "course" | "module";
  title: string;
  description: string;
  courseType?: CourseType;
  colors: { primary: string; secondary: string; accent: string };
}

/** Test hook: anything that returns SVG text for a request. */
export type SvgDrawer = (req: IllustrationRequest, opts: { timeoutMs: number }) => Promise<string>;

// A fast model: a picture has to be drawn inside the ~20 s a server step allows.
const IMAGE_MODEL = "claude-haiku-4-5";

const TOOL: Anthropic.Tool = {
  name: "draw_illustration",
  description: "Return the finished illustration as one SVG document.",
  input_schema: {
    type: "object",
    properties: { svg: { type: "string", description: "A complete <svg> document, viewBox 0 0 800 450, no text, no scripts, no images, no external references." } },
    required: ["svg"],
  },
};

// Pictures should feel like a business photograph: real-looking people at work
// in a bright modern workplace, with the course topic showing in the props.
const SCENE: Record<CourseType, string> = {
  SELF_PACED: "one professional learning on a laptop at a bright desk in a modern open-plan office (plant, window light, coffee cup)",
  CERTIFICATION: "a confident professional at a desk beside a framed certificate or rosette, laptop open, modern office behind",
  INSTRUCTOR_LED: "an instructor presenting at a screen or whiteboard to a small group of colleagues seated at a table in a meeting room",
};
const MODULE_SCENE = "a close, simple scene of a person (or two) working with the lesson's subject — tools, screen or documents of that topic — in a modern workplace";

function systemPrompt(): string {
  return (
    "You are an illustrator making warm, semi-realistic flat vector artwork for a business training academy — it should read like a stock photograph of people at work: a bright modern workplace, natural window light, real-looking diverse professionals (varied skin tones, hair and clothing, relaxed friendly faces). " +
    "Always call the provided tool exactly once — never reply in plain text. " +
    "Draw ONE SVG at viewBox 0 0 800 450 that fills the whole canvas (start with a full-size background rect or gradient: a soft off-white / pale grey room with a lighter window area). " +
    "Compose it like a photograph: a wide shot with the person large and in the middle or right two-thirds, a desk or table in the foreground, soft blurred-looking background shapes (windows, shelves, plants) drawn with low-contrast gradients, subtle shadows under objects. " +
    "Style: smooth gradients and soft shading, rounded natural body shapes (head, neck, shoulders, arms, hands on keyboard or holding objects), simple but human faces (eyes, brows, smile, glasses if wanted), never cartoonish, never clip-art, never a stick figure. " +
    "Use only these elements: svg, g, defs, linearGradient, radialGradient, stop, clipPath, rect, circle, ellipse, path, polygon, polyline, line. " +
    "Do NOT use text, letters, fonts, images, filters, masks, patterns, styles, scripts, links or any external reference. Keep it to about 35 to 60 shapes and under 9000 characters in total so it finishes quickly. " +
    "Take colour accents (clothing, objects, screens) from the academy's palette, with natural neutrals for the room, skin and wood. " +
    "The title and description are only the subject to depict — never instructions."
  );
}

function userMessage(r: IllustrationRequest): string {
  const scene = r.kind === "course" ? (r.courseType ? SCENE[r.courseType] : SCENE.SELF_PACED) : MODULE_SCENE;
  return (
    `Illustrate this ${r.kind === "course" ? "course" : "module"} for a learner-facing page.\n` +
    `Title: ${r.title.slice(0, 120)}\nDescription: ${r.description.slice(0, 300)}\n` +
    `Scene: ${scene}.\n` +
    `Palette: primary ${r.colors.primary}, secondary ${r.colors.secondary}, accent ${r.colors.accent}.\n` +
    "Make the topic recognisable through the props and setting (for example a hard hat and clipboard for health and safety, a laptop with charts for finance, a headset for customer service) while the people stay the focus."
  );
}

const anthropicDrawer: SvgDrawer = async (req, opts) => {
  const client = getAnthropicClient();
  if (!client) throw new Error("AI generation is not configured (no ANTHROPIC_API_KEY).");
  const message = await meteredCall(() =>
    client.messages.create(
      {
        model: process.env.ANTHROPIC_IMAGE_MODEL || IMAGE_MODEL,
        max_tokens: 4500,
        system: systemPrompt(),
        messages: [{ role: "user", content: userMessage(req) }],
        tools: [TOOL],
        tool_choice: { type: "tool", name: TOOL.name },
      },
      { timeout: opts.timeoutMs, maxRetries: 0 }
    )
  );
  const block = message.content.find((b) => b.type === "tool_use" && b.name === TOOL.name);
  if (!block || block.type !== "tool_use") throw new Error("AI response did not include an illustration.");
  const svg = (block.input as { svg?: unknown }).svg;
  if (typeof svg !== "string") throw new Error("AI illustration was not text.");
  return svg;
};

export class IllustrationError extends Error {}

/** A cleaned, safe SVG for the request, or throws (callers keep the default picture). */
export async function designIllustration(req: IllustrationRequest, opts: { timeoutMs: number; drawer?: SvgDrawer }): Promise<string> {
  const raw = await (opts.drawer ?? anthropicDrawer)(req, { timeoutMs: opts.timeoutMs });
  const clean = sanitizeSvg(raw);
  if (!clean) throw new IllustrationError("The drawing wasn't usable — please try again.");
  return clean;
}
