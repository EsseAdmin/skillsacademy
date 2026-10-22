// The homepage's "What you'll learn" section.
//
// The academy admin can write the points themselves (one per line, saved in
// academies.learn_items). Until they do, the list is drawn from the published
// courses so the section is never empty: each course contributes the first
// sentence of its description, or "Complete <course title>" when it has none.
import type { Course } from "@/lib/queries";

export const MAX_LEARN_ITEMS = 8;
export const MAX_LEARN_ITEM_LENGTH = 160;

/** Splits the stored/typed text into clean points (one per line, bullets and blanks dropped). */
export function parseLearnItems(raw: string | null | undefined): string[] {
  return String(raw || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•✓✔]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .map((l) => l.slice(0, MAX_LEARN_ITEM_LENGTH))
    .slice(0, MAX_LEARN_ITEMS);
}

/** Normalises a list of points for saving (same rules as parseLearnItems). */
export function serializeLearnItems(items: string[]): string {
  return parseLearnItems(items.join("\n")).join("\n");
}

function firstSentence(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "";
  const m = t.match(/^(.+?[.!?])(\s|$)/);
  const s = (m ? m[1] : t).trim();
  return s.length > MAX_LEARN_ITEM_LENGTH ? s.slice(0, MAX_LEARN_ITEM_LENGTH - 1).trimEnd() + "…" : s;
}

/** The points to show: the admin's own, else ones drawn from the published courses. */
export function learnItemsFor(learnItemsText: string | null | undefined, courses: Pick<Course, "title" | "description">[]): string[] {
  const own = parseLearnItems(learnItemsText);
  if (own.length > 0) return own;
  return courses
    .slice(0, 6)
    .map((c) => firstSentence(c.description || "") || `Complete ${c.title}`)
    .filter(Boolean);
}
