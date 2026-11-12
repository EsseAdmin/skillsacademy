// Languages an academy can be created in. The academy's language decides the
// wording of everything its learners see (public site, sign-in, learner
// portal, emails to them) and the language AI-generated content is written in.
// Admin and instructor screens stay in English.
import { en, type MessageKey } from "./en";
import { fr } from "./fr";
import { es } from "./es";
import { de } from "./de";

export const LANGUAGES = [
  { code: "en", label: "English", locale: "en-GB", aiName: "UK English" },
  { code: "fr", label: "Français", locale: "fr-FR", aiName: "French" },
  { code: "es", label: "Español", locale: "es-ES", aiName: "Spanish" },
  { code: "de", label: "Deutsch", locale: "de-DE", aiName: "German" },
] as const;

export type Lang = (typeof LANGUAGES)[number]["code"];
export const DEFAULT_LANG: Lang = "en";

export function normalizeLang(value: unknown): Lang {
  const v = String(value ?? "").trim().toLowerCase();
  return (LANGUAGES.find((l) => l.code === v)?.code ?? DEFAULT_LANG) as Lang;
}

export function isLang(value: unknown): value is Lang {
  return LANGUAGES.some((l) => l.code === value);
}

export function localeFor(lang: Lang): string {
  return LANGUAGES.find((l) => l.code === lang)!.locale;
}

/** Name of the language as the AI prompts should say it ("French"). */
export function aiLanguageName(lang: Lang): string {
  return LANGUAGES.find((l) => l.code === lang)!.aiName;
}

export type Message = string | { one: string; other: string };
export type Messages = Record<MessageKey, Message>;
export type { MessageKey };

const TABLES: Record<Lang, Messages> = { en, fr, es, de };

export type TFunction = (key: MessageKey, vars?: Record<string, string | number>) => string;

function fill(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole));
}

/** Translator for a language: t("site_start_learning"), t("catalog_summary", { n: 3, name }). */
export function getT(language?: string | null): TFunction {
  const lang = normalizeLang(language);
  const table = TABLES[lang];
  const rules = new Intl.PluralRules(localeFor(lang));
  return (key, vars) => {
    const message = table[key] ?? en[key];
    if (typeof message === "string") return fill(message, vars);
    const n = Number(vars?.n ?? 0);
    const form = rules.select(n) === "one" ? message.one : message.other;
    return fill(form, vars);
  };
}

/**
 * Sentence to append to an AI system prompt so everything the model writes is in
 * the academy's language. Empty for English, which the prompts already assume.
 */
export function languageInstruction(lang: Lang): string {
  if (lang === "en") return "";
  const name = aiLanguageName(lang);
  return ` Write every piece of text a learner will read — names, titles, headlines, taglines, descriptions, slide and section text, questions and answers — in ${name}, using natural, professional ${name}. The only exceptions are machine values (colour codes, web-address slugs, content type names), which stay exactly as the tool schema requires. Do not translate or alter text the admin quoted that must stay as written (names of people, organisations and products).`;
}
