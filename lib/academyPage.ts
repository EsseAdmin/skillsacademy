// An academy's public page as data, edited by its academy admin in the Page designer
// (draft → preview → publish) and rendered by components/AcademyDesignedSite.tsx.
//
// It reuses the section builder of the SkillsAcademy.ai home page (lib/marketingPage.ts —
// hero, text, cards, split, columns, steps, banner, call-to-action) and adds the sections an
// academy needs: video, news, "what you'll learn", the course list and learning journeys.
// Pure (no database, no React) so it can be tested on its own.
//
// Everything that comes from the designer, an AI rewrite or a restored version goes through
// sanitizeAcademyPage(): unknown fields are dropped, lengths are clamped, links are limited to
// safe forms, pictures to files we stored ourselves, colours to #rrggbb and fonts to our list.

import {
  IMAGE_KEY_RE,
  LIMITS,
  blankSection,
  clampStr,
  newSectionId,
  oneOf,
  safeColor,
  safeHref,
  sanitizeSection,
  type LinkItem,
  type PricingSection,
  type Section,
  type SectionType,
} from "@/lib/marketingPage";

export { IMAGE_KEY_RE, newSectionId, safeHref, safeColor, clampStr };
export type { LinkItem };

export type ImageKey = string;
export function academyImageUrl(slug: string, key: ImageKey): string {
  return `/api/academy-page-image/${slug}/${key}`;
}

// ---------- Sections ----------
export const ACADEMY_SECTION_TYPES = ["hero", "text", "banner", "video", "news", "courses", "journeys", "learn", "cards", "split", "columns", "steps", "cta"] as const;
export type AcademySectionType = (typeof ACADEMY_SECTION_TYPES)[number];

export const ACADEMY_SECTION_LABEL: Record<AcademySectionType, string> = {
  hero: "Hero (top of page)",
  text: "Text block",
  banner: "Picture banner",
  video: "Video",
  news: "News post",
  courses: "Course list",
  journeys: "Learning journeys",
  learn: "What you'll learn",
  cards: "Cards grid",
  split: "Text + picture / list",
  columns: "Columns with bullet lists",
  steps: "Numbered steps",
  cta: "Call-to-action band",
};
export const ACADEMY_SECTION_HINT: Record<AcademySectionType, string> = {
  hero: "The big opening: headline, intro, buttons and an optional picture.",
  text: "A heading and one or more paragraphs.",
  banner: "A wide picture with a headline and an optional button over it.",
  video: "A YouTube, Vimeo or video-file link, with a heading and caption.",
  news: "A dated announcement with an optional picture.",
  courses: "Your published courses, drawn automatically as cards (grouped by course type, or all together).",
  journeys: "Your published learning journeys, drawn automatically as maps.",
  learn: "A tick-list of what learners will get out of your academy.",
  cards: "A grid of cards, each with an icon, a heading and a sentence.",
  split: "A heading and paragraph on one side; a picture and/or a list on the other.",
  columns: "Two to four columns, each with an icon, a title and a bullet list.",
  steps: "A row of numbered steps.",
  cta: "A coloured band with a heading, a sentence and one button.",
};

interface ABase {
  id: string;
  visible: boolean;
  /** The #anchor menu links can jump to (letters, digits and dashes). */
  anchor: string;
  /** Optional background colour for this section ("" = the section's normal look). */
  bg: string;
}
export interface VideoSection extends ABase {
  type: "video";
  title: string;
  url: string;
  caption: string;
}
export interface NewsSection extends ABase {
  type: "news";
  tag: string;
  title: string;
  body: string;
  image: ImageKey | null;
  imageAlt: string;
  /** YYYY-MM-DD, or "" for no date. */
  date: string;
}
export interface LearnSection extends ABase {
  type: "learn";
  title: string;
  points: string[];
}
export interface CoursesSection extends ABase {
  type: "courses";
  /** "" = the automatic wording (the course type names, or "Our courses"). */
  title: string;
  sub: string;
  grouping: "type" | "all";
  columns: 2 | 3 | 4;
}
export interface JourneysSection extends ABase {
  type: "journeys";
  title: string;
  sub: string;
}
type Shared = Exclude<Section, PricingSection>;
export type AcademySection = (Shared & { bg: string }) | VideoSection | NewsSection | LearnSection | CoursesSection | JourneysSection;

// ---------- Look: colours, fonts, header, footer ----------
export const FONTS = {
  system: { label: "Clean (system sans-serif)", stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif` },
  humanist: { label: "Friendly (Trebuchet)", stack: `"Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", Verdana, sans-serif` },
  verdana: { label: "Wide and clear (Verdana)", stack: `Verdana, Geneva, Tahoma, sans-serif` },
  serif: { label: "Classic serif (Georgia)", stack: `Georgia, "Times New Roman", Times, serif` },
  elegant: { label: "Elegant serif (Palatino)", stack: `"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif` },
} as const;
export type FontKey = keyof typeof FONTS;
export const FONT_KEYS = Object.keys(FONTS) as FontKey[];

export interface AcademyTheme {
  /** "" = the colour from the academy's Branding template. */
  primary: string;
  secondary: string;
  accent: string;
  /** Page background behind the sections ("" = the standard soft grey). */
  background: string;
  headingFont: FontKey;
  bodyFont: FontKey;
}
export interface AcademyPage {
  version: 1;
  theme: AcademyTheme;
  seo: { title: string; description: string };
  header: { style: "brand" | "light"; links: LinkItem[]; registerLabel: string; signInLabel: string };
  footer: { style: "brand" | "light"; text: string; links: LinkItem[] };
  sections: AcademySection[];
}

export const DEFAULT_THEME: AcademyTheme = { primary: "", secondary: "", accent: "", background: "", headingFont: "system", bodyFont: "system" };
export const DEFAULT_BACKGROUND = "#f6f7fb";

// ---------- Text ----------
/** {academy} and {year} are the only placeholders an academy page has. */
export const ACADEMY_TOKEN_HELP = [
  { token: "{academy}", meaning: "your academy's name" },
  { token: "{year}", meaning: "the current year" },
];
export function fillTokens(text: string, v: { name: string; year?: number }): string {
  return text.replace(/\{academy\}/g, v.name).replace(/\{year\}/g, String(v.year ?? new Date().getFullYear()));
}

/** Blends a #rrggbb colour towards another by `amount` (0..1). */
export function mixHex(hex: string, other: [number, number, number], amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v, i) => Math.round(v + (other[i] - v) * amount));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// ---------- Defaults ----------
export interface LegacyBlock {
  type: "TEXT" | "IMAGE" | "VIDEO" | "NEWS" | "LEARN";
  title: string;
  body: string;
  videoUrl: string | null;
  /** The block's picture, already copied into the designer's storage (or null). */
  imageKey: ImageKey | null;
  published: boolean;
  /** ISO timestamp the block was created. */
  createdAt: string;
  /** LEARN blocks: the points. */
  points?: string[];
}
export interface LegacyInput {
  slug: string;
  name: string;
  headline: string;
  tagline: string;
  blocks: LegacyBlock[];
}

function registerHref(slug: string): string {
  return `/a/${slug}/register`;
}

/** A fresh, sensible section of a given type for the designer's "Add a section". */
export function blankAcademySection(type: AcademySectionType, slug: string): AcademySection {
  const base = { id: newSectionId(), visible: true, anchor: "", bg: "" };
  switch (type) {
    case "video":
      return { ...base, type, title: "Watch: what to expect", url: "", caption: "" };
    case "news":
      return { ...base, type, tag: "News", title: "Something to announce", body: "Write your news here.", image: null, imageAlt: "", date: new Date().toISOString().slice(0, 10) };
    case "learn":
      return { ...base, type, title: "What you'll learn", points: ["A first thing learners will be able to do", "A second thing they will be able to do"] };
    case "courses":
      return { ...base, type, title: "", sub: "", grouping: "type", columns: 3 };
    case "journeys":
      return { ...base, type, title: "", sub: "" };
    default: {
      const s = { ...blankSection(type as SectionType), bg: "" } as Shared & { bg: string };
      if (s.type === "hero") s.primaryHref = registerHref(slug);
      if (s.type === "cta") {
        s.buttonHref = registerHref(slug);
        s.buttonLabel = "Join now →";
      }
      if (s.type === "hero") s.showStats = false;
      return s;
    }
  }
}

/** The page an academy starts from: its current hero, custom blocks, courses and journeys. */
export function defaultAcademyPage(input: LegacyInput): AcademyPage {
  const sections: AcademySection[] = [];
  const hero = blankAcademySection("hero", input.slug) as AcademySection & { type: "hero" };
  hero.id = "hero";
  hero.headline = input.headline || input.name;
  hero.sub = input.tagline;
  hero.tag = "";
  sections.push(hero);

  for (const b of input.blocks) {
    const common = { id: newSectionId(), visible: b.published, anchor: "", bg: "" };
    switch (b.type) {
      case "TEXT":
        sections.push({ ...common, type: "text", tone: "light", tag: "", title: b.title, body: b.body, align: "center" });
        break;
      case "IMAGE":
        sections.push({ ...common, type: "banner", image: b.imageKey, imageAlt: b.title, title: b.title, text: b.body, buttonLabel: "", buttonHref: "", height: "medium" });
        break;
      case "VIDEO":
        if (b.videoUrl) sections.push({ ...common, type: "video", title: b.title, url: b.videoUrl, caption: b.body });
        break;
      case "NEWS":
        sections.push({ ...common, type: "news", tag: "News", title: b.title, body: b.body, image: b.imageKey, imageAlt: b.title, date: b.createdAt.slice(0, 10) });
        break;
      case "LEARN":
        if (b.points && b.points.length) sections.push({ ...common, type: "learn", title: b.title, points: b.points });
        break;
    }
  }
  sections.push({ ...(blankAcademySection("courses", input.slug) as CoursesSection), anchor: "courses" });
  sections.push({ ...(blankAcademySection("journeys", input.slug) as JourneysSection), anchor: "journeys" });

  return {
    version: 1,
    theme: { ...DEFAULT_THEME },
    seo: { title: "", description: "" },
    header: { style: "brand", links: [], registerLabel: "", signInLabel: "" },
    footer: { style: "brand", text: "", links: [] },
    sections: sections.slice(0, LIMITS.sections),
  };
}

// ---------- Sanitising ----------
function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function line(v: unknown, max: number, fallback = ""): string {
  return clampStr(typeof v === "string" ? v.replace(/\s*\n\s*/g, " ") : v, max, fallback);
}
function imageKey(v: unknown): ImageKey | null {
  return typeof v === "string" && IMAGE_KEY_RE.test(v) ? v : null;
}
function anchorOf(v: unknown): string {
  return typeof v === "string" ? v.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) : "";
}
/** An https link to a video; anything else becomes "". */
export function safeVideoUrl(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s || s.length > 300 || /[\u0000-\u001f\s]/.test(s)) return "";
  try {
    const u = new URL(s);
    return u.protocol === "https:" && u.hostname.includes(".") ? s : "";
  } catch {
    return "";
  }
}
function linkList(v: unknown): LinkItem[] {
  if (!Array.isArray(v)) return [];
  const out: LinkItem[] = [];
  for (const x of v.slice(0, LIMITS.links)) {
    const r = rec(x);
    if (!r) continue;
    const label = line(r.label, 60);
    const href = safeHref(r.href);
    if (label && href) out.push({ label, href });
  }
  return out;
}

/** One section from untrusted JSON, or null when it isn't a section an academy page has. */
export function sanitizeAcademySection(raw: unknown, slug: string, usedIds?: Set<string>): AcademySection | null {
  const r = rec(raw);
  if (!r) return null;
  const type = String(r.type);
  if (!(ACADEMY_SECTION_TYPES as readonly string[]).includes(type)) return null;
  let id = typeof r.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(r.id) ? r.id : newSectionId();
  if (usedIds) {
    while (usedIds.has(id)) id = newSectionId();
    usedIds.add(id);
  }
  const base = { id, visible: r.visible !== false, anchor: anchorOf(r.anchor), bg: safeColor(r.bg, "") };
  switch (type as AcademySectionType) {
    case "video":
      return { ...base, type: "video", title: clampStr(r.title, LIMITS.title), url: safeVideoUrl(r.url), caption: clampStr(r.caption, LIMITS.sub) };
    case "news": {
      const date = typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : "";
      return { ...base, type: "news", tag: line(r.tag, LIMITS.short), title: clampStr(r.title, LIMITS.title), body: clampStr(r.body, LIMITS.body), image: imageKey(r.image), imageAlt: line(r.imageAlt, 160), date };
    }
    case "learn": {
      const points = (Array.isArray(r.points) ? r.points : []).slice(0, 12).map((p) => line(p, 160)).filter(Boolean);
      return { ...base, type: "learn", title: clampStr(r.title, LIMITS.title), points };
    }
    case "courses":
      return {
        ...base, type: "courses",
        title: clampStr(r.title, LIMITS.title), sub: clampStr(r.sub, LIMITS.sub),
        grouping: oneOf(r.grouping, ["type", "all"] as const, "type"),
        columns: r.columns === 2 || r.columns === 4 ? r.columns : 3,
      };
    case "journeys":
      return { ...base, type: "journeys", title: clampStr(r.title, LIMITS.title), sub: clampStr(r.sub, LIMITS.sub) };
    default: {
      const s = sanitizeSection(raw, usedIds ? new Set<string>() : undefined);
      if (!s || s.type === "pricing") return null;
      const out = { ...s, id, anchor: base.anchor, visible: base.visible, bg: base.bg } as Shared & { bg: string };
      if (out.type === "hero") {
        out.primaryHref = safeHref(r.primaryHref) || registerHref(slug);
        out.showStats = false;
        out.stats = [];
      }
      if (out.type === "cta") out.buttonHref = safeHref(r.buttonHref) || registerHref(slug);
      return out;
    }
  }
}

/** The whole page from untrusted JSON; null when it isn't usable at all. */
export function sanitizeAcademyPage(raw: unknown, slug: string): AcademyPage | null {
  const r = rec(raw);
  if (!r || !Array.isArray(r.sections)) return null;
  const used = new Set<string>();
  const sections: AcademySection[] = [];
  for (const s of r.sections.slice(0, LIMITS.sections)) {
    const clean = sanitizeAcademySection(s, slug, used);
    if (clean) sections.push(clean);
  }
  const theme = rec(r.theme) ?? {};
  const seo = rec(r.seo) ?? {};
  const header = rec(r.header) ?? {};
  const footer = rec(r.footer) ?? {};
  return {
    version: 1,
    theme: {
      primary: safeColor(theme.primary, ""),
      secondary: safeColor(theme.secondary, ""),
      accent: safeColor(theme.accent, ""),
      background: safeColor(theme.background, ""),
      headingFont: oneOf(theme.headingFont, FONT_KEYS, "system"),
      bodyFont: oneOf(theme.bodyFont, FONT_KEYS, "system"),
    },
    seo: { title: line(seo.title, 70), description: line(seo.description, 200) },
    header: {
      style: oneOf(header.style, ["brand", "light"] as const, "brand"),
      links: linkList(header.links),
      registerLabel: line(header.registerLabel, 40),
      signInLabel: line(header.signInLabel, 40),
    },
    footer: { style: oneOf(footer.style, ["brand", "light"] as const, "brand"), text: line(footer.text, 240), links: linkList(footer.links) },
    sections,
  };
}

/** Parses stored JSON; null when it is missing or damaged. */
export function parseAcademyPage(json: string | null | undefined, slug: string): AcademyPage | null {
  if (!json) return null;
  try {
    return sanitizeAcademyPage(JSON.parse(json), slug);
  } catch {
    return null;
  }
}

/** The picture keys a page refers to. */
export function academyImagesIn(page: AcademyPage): ImageKey[] {
  const keys = new Set<ImageKey>();
  for (const s of page.sections) if ("image" in s && s.image) keys.add(s.image);
  return [...keys];
}

// ---------- AI rewrites change wording only ----------
const WORDING: Record<AcademySectionType, string[]> = {
  hero: ["tag", "headline", "sub", "primaryLabel", "secondaryLabel", "imageAlt"],
  text: ["tag", "title", "body"],
  banner: ["title", "text", "buttonLabel", "imageAlt"],
  video: ["title", "caption"],
  news: ["tag", "title", "body", "imageAlt"],
  courses: ["title", "sub"],
  journeys: ["title", "sub"],
  learn: ["title", "points"],
  cards: ["tag", "title", "sub", "items"],
  split: ["tag", "title", "sub", "body", "imageAlt", "listTitle", "list"],
  columns: ["tag", "title", "sub", "items"],
  steps: ["tag", "title", "items"],
  cta: ["tag", "title", "text", "buttonLabel"],
};
/** The original section with only the wording taken from a rewritten one — never links, pictures, colours, layout or visibility. */
export function mergeAcademyWording(original: AcademySection, rewritten: unknown, slug: string): AcademySection {
  const next = sanitizeAcademySection({ ...(rec(rewritten) ?? {}), type: original.type, id: original.id }, slug);
  if (!next) return original;
  const merged: Record<string, unknown> = { ...original };
  for (const f of WORDING[original.type]) {
    const v = (next as unknown as Record<string, unknown>)[f];
    if (v !== undefined) merged[f] = v;
  }
  return sanitizeAcademySection(merged, slug) ?? original;
}


/** Does the designed page show the learning journeys? "missing": no such block; "hidden": the block is switched off. */
export function journeysSectionStatus(page: AcademyPage): "ok" | "missing" | "hidden" {
  const all = page.sections.filter((x) => x.type === "journeys");
  if (all.length === 0) return "missing";
  return all.some((x) => x.visible) ? "ok" : "hidden";
}

/** The same page with a visible journeys block: an existing hidden one is switched on, otherwise one is added after the course list. */
export function withJourneysSection(page: AcademyPage, slug: string): AcademyPage {
  const status = journeysSectionStatus(page);
  if (status === "ok") return page;
  if (status === "hidden") {
    let done = false;
    return { ...page, sections: page.sections.map((x) => (x.type === "journeys" && !done ? ((done = true), { ...x, visible: true }) : x)) };
  }
  const added = { ...(blankAcademySection("journeys", slug) as JourneysSection), anchor: "journeys" };
  let at = -1;
  page.sections.forEach((x, i) => {
    if (x.type === "courses") at = i;
  });
  const sections = page.sections.slice();
  if (at >= 0) sections.splice(at + 1, 0, added);
  else sections.push(added);
  return { ...page, sections: sections.slice(0, LIMITS.sections) };
}
