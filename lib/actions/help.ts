"use server";

import { requireTenantSession } from "@/lib/authz";
import { Academies } from "@/lib/queries";
import { isAiConfigured } from "@/lib/ai";
import { withAiMeter, isHelpLimitError, isAiLimitError, HELP_DAILY_LIMIT } from "@/lib/aiUsage";
import { answerFromGuide, askHelp, cleanHistory, HelpAiError, type HelpAnswer } from "@/lib/aiHelp";

export type HelpResult = { ok: true; answer: HelpAnswer } | { ok: false; error: string };

// The Help assistant for academy admins. Read-only: it answers and links, it never changes anything.
export async function askHelpAgent(slug: string, rawHistory: unknown): Promise<HelpResult> {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN"]);
  const academy = await Academies.byId(session.academyId!);
  if (!academy) return { ok: false, error: "Academy not found." };
  const history = cleanHistory(rawHistory);
  if (history.length === 0) return { ok: false, error: "Type a question first." };
  const question = history[history.length - 1].text;

  // No AI key on this platform: still useful - answer from the built-in guide.
  if (!isAiConfigured()) return { ok: true, answer: answerFromGuide(slug, question) };

  try {
    const answer = await withAiMeter({ academyId: academy.id, userId: session.userId, source: "help", label: "Help question" }, () => askHelp(academy.id, slug, history));
    return { ok: true, answer };
  } catch (err) {
    if (isHelpLimitError(err)) {
      return { ok: true, answer: answerFromGuide(slug, question, `You've asked ${HELP_DAILY_LIMIT} questions in the last 24 hours, so here is what the guide says instead.`) };
    }
    if (isAiLimitError(err)) return { ok: false, error: "The assistant is unavailable right now." };
    if (err instanceof HelpAiError) return { ok: true, answer: answerFromGuide(slug, question, "The assistant couldn't answer just now, so here is what the guide says.") };
    console.error("[help] question failed:", err);
    return { ok: true, answer: answerFromGuide(slug, question, "The assistant couldn't answer just now, so here is what the guide says.") };
  }
}
