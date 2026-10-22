// Picks the default picture for a course or module that has no uploaded image.
// The pictures themselves are original illustrations (components/CourseArt.tsx),
// chosen by keywords in the title and category so e.g. "Foundations of
// Psychology" gets a brain and "Python Basics" gets code — never a generic book.
export type ArtKind = "learning" | "mind" | "people" | "chart" | "code" | "health" | "legal" | "science" | "language";

const RULES: { kind: ArtKind; re: RegExp }[] = [
  { kind: "code", re: /\b(?:python|programming|coding|code|software|developer|javascript|typescript|html|css|sql|computer|computing|cyber|cloud|devops|machine learning|artificial intelligence|ai\b|algorithm|excel\b)/ },
  { kind: "mind", re: /\b(?:psycholog|mind|brain|mental|behaviou?r|cognit|neuro|psychiatr|emotion|mindful|well-?being|resilien)/ },
  { kind: "health", re: /\b(?:health|nurs|medic|care\b|carer|first aid|safety|wellness|fitness|clinical|pharma|dental|nutrition|hygiene|safeguard)/ },
  { kind: "legal", re: /\b(?:law|legal|complian|ethic|governance|policy|policies|risk|gdpr|regulat|audit|security|data protection|contract)/ },
  { kind: "science", re: /\b(?:science|engineer|chemi|physic|biolog|math|stem\b|laborator|statistic)/ },
  { kind: "language", re: /\b(?:english|language|writing|literacy|grammar|reading|vocabulary|esol|speaking|presentation)/ },
  { kind: "people", re: /\b(?:counsel|coach|communicat|leader|team|manag|customer|client|onboard|hr\b|human resources|stakeholder|negotiat|conversation|interpersonal|mentor|sales|service|supervis|culture|facilitat)/ },
  { kind: "chart", re: /\b(?:business|financ|account|strateg|consult|analytic|data\b|market|econom|transform|growth|budget|invest|project|performance|kpi|report|operations|process)/ },
];

export function pickArt(title: string, category = "", description = ""): ArtKind {
  const primary = `${title} ${category}`.toLowerCase();
  for (const r of RULES) if (r.re.test(primary)) return r.kind;
  const secondary = description.toLowerCase().slice(0, 240);
  if (secondary) for (const r of RULES) if (r.re.test(secondary)) return r.kind;
  return "learning";
}

/** True when the course still has the default book emoji (or none), i.e. the admin hasn't chosen their own. */
export function usesDefaultEmoji(emoji: string | null | undefined): boolean {
  const e = (emoji || "").trim();
  return e === "" || e === "📘";
}
