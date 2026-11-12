// The SkillsAcademy.ai home page as data. The super admin edits this JSON in the
// Home page editor (draft → preview → publish); app/(marketing)/page.tsx renders
// the published copy. Pure (no database, no React) so it can be tested on its own.
//
// Everything that comes from the editor, an AI rewrite or a restored version goes
// through sanitizePage(): unknown fields are dropped, lengths are clamped, links
// are limited to safe forms and image references to files we stored ourselves.

import { summariseTrials, allPlansHaveTrial } from "@/lib/trial";

export const SECTION_TYPES = ["hero", "cards", "split", "columns", "steps", "pricing", "banner", "text", "cta"] as const;
export type SectionType = (typeof SECTION_TYPES)[number];
export const SECTION_LABEL: Record<SectionType, string> = {
  hero: "Hero (top of page)",
  cards: "Cards grid",
  split: "Text + picture / list",
  columns: "Columns with bullet lists",
  steps: "Numbered steps",
  pricing: "Pricing (live from your plans)",
  banner: "Picture banner",
  text: "Text block",
  cta: "Call-to-action band",
};
export const SECTION_HINT: Record<SectionType, string> = {
  hero: "The big opening: headline, intro, buttons, optional picture and statistics.",
  cards: "A grid of cards, each with an icon, a heading and a sentence.",
  split: "A heading and paragraph on one side; a picture and/or a numbered or bulleted list on the other.",
  columns: "Two to four columns, each with an icon, a title and a bullet list.",
  steps: "A row of numbered steps.",
  pricing: "Shows your subscription plans and prices automatically — only the wording around them is editable.",
  banner: "A wide picture with a headline and an optional button over it.",
  text: "A heading and one or more paragraphs.",
  cta: "A coloured band with a heading, a sentence and one button.",
};

export const TONES = ["light", "dark", "deep"] as const;
export type Tone = (typeof TONES)[number];

/** A picture we stored (marketing/<key>), shown from /api/marketing-image/<key>. */
export type ImageKey = string;
export const IMAGE_KEY_RE = /^[a-z0-9][a-z0-9-]{6,60}\.(png|jpg|gif|webp|svg)$/;
export function imageUrl(key: ImageKey): string {
  return `/api/marketing-image/${key}`;
}

export interface Item {
  icon: string;
  title: string;
  text: string;
}
export interface ColumnItem {
  icon: string;
  title: string;
  bullets: string[];
}
export interface StepItem {
  title: string;
  text: string;
}
export interface Stat {
  value: string;
  label: string;
}

interface Base {
  id: string;
  visible: boolean;
  /** The #anchor the nav links can jump to (letters, digits and dashes). */
  anchor: string;
}
export interface HeroSection extends Base {
  type: "hero";
  tag: string;
  headline: string;
  sub: string;
  /** Blank = automatic ("Start Your 14 Day Free Trial" / "Create Your Academy"). */
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
  image: ImageKey | null;
  imageAlt: string;
  showStats: boolean;
  stats: Stat[];
}
export interface CardsSection extends Base {
  type: "cards";
  tone: Tone;
  tag: string;
  title: string;
  sub: string;
  columns: 2 | 3 | 4;
  items: Item[];
}
export interface SplitSection extends Base {
  type: "split";
  tone: Tone;
  tag: string;
  title: string;
  sub: string;
  body: string;
  image: ImageKey | null;
  imageAlt: string;
  imageSide: "left" | "right";
  listTitle: string;
  listStyle: "numbered" | "bullets" | "none";
  list: StepItem[];
}
export interface ColumnsSection extends Base {
  type: "columns";
  tone: Tone;
  tag: string;
  title: string;
  sub: string;
  items: ColumnItem[];
}
export interface StepsSection extends Base {
  type: "steps";
  tone: Tone;
  tag: string;
  title: string;
  items: StepItem[];
}
export interface PricingSection extends Base {
  type: "pricing";
  tag: string;
  title: string;
  sub: string;
  ctaLabel: string;
  badge: string;
}
export interface BannerSection extends Base {
  type: "banner";
  image: ImageKey | null;
  imageAlt: string;
  title: string;
  text: string;
  buttonLabel: string;
  buttonHref: string;
  height: "short" | "medium" | "tall";
}
export interface TextSection extends Base {
  type: "text";
  tone: Tone;
  tag: string;
  title: string;
  body: string;
  align: "left" | "center";
}
export interface CtaSection extends Base {
  type: "cta";
  tag: string;
  title: string;
  text: string;
  buttonLabel: string;
  buttonHref: string;
}
export type Section = HeroSection | CardsSection | SplitSection | ColumnsSection | StepsSection | PricingSection | BannerSection | TextSection | CtaSection;

export interface LinkItem {
  label: string;
  href: string;
}
export interface HomePage {
  version: 1;
  theme: { navy: string; gold: string };
  seo: { title: string; description: string };
  nav: { logoBefore: string; logoAccent: string; logoAfter: string; links: LinkItem[]; loginLabel: string; ctaLabel: string };
  footer: { text: string; links: LinkItem[] };
  sections: Section[];
}

export const LIMITS = {
  sections: 30,
  items: 12,
  bullets: 10,
  steps: 8,
  stats: 4,
  links: 8,
  short: 120,
  title: 200,
  sub: 600,
  body: 3000,
  text: 400,
} as const;

// ---------- Defaults: exactly the page as it was before it became editable ----------
export const DEFAULT_HOME_PAGE: HomePage = {
  version: 1,
  theme: { navy: "#0b1f3b", gold: "#fbcb07" },
  seo: { title: "", description: "" },
  nav: {
    logoBefore: "Skills",
    logoAccent: "Academy",
    logoAfter: ".ai",
    links: [
      { label: "Platform", href: "/#solution" },
      { label: "Who It's For", href: "/#segments" },
      { label: "Pricing", href: "/#pricing" },
      { label: "How It Works", href: "/#how" },
    ],
    loginLabel: "Log In",
    ctaLabel: "Create Your Academy",
  },
  footer: {
    text: "© {year} SkillsAcademy.ai — Academy-as-a-Service for business, charity & public sector.",
    links: [
      { label: "Create an Academy", href: "/signup" },
      { label: "Academy Login", href: "/login" },
    ],
  },
  sections: [
    {
      id: "hero", type: "hero", visible: true, anchor: "",
      tag: "Academy-as-a-Service",
      headline: "Launch Your Own\n*Branded* Academy",
      sub: "SkillsAcademy.ai gives businesses, charities and public sector organisations a ready-made, Moodle-style learning platform — your own courses, your own modules, your own learners — live in minutes, not months.",
      primaryLabel: "", primaryHref: "/signup",
      secondaryLabel: "See How It Works", secondaryHref: "#solution",
      image: null, imageAlt: "",
      showStats: true,
      stats: [
        { value: "{planCount}", label: "Subscription Plans" },
        { value: "{{#trial}}{trialDays}{{else}}—{{/trial}}", label: "{{#trial}}Day Free Trial{{else}}Simple Monthly Plans{{/trial}}" },
        { value: "{academyCount}+", label: "Academies Live" },
      ],
    },
    {
      id: "problem", type: "cards", visible: true, anchor: "problem", tone: "light", columns: 3,
      tag: "The Challenge",
      title: "Every organisation faces the same skills & training gap",
      sub: "Whether you're a business, charity, or public sector body — fragmented, inconsistent training is costing you time, money, and credibility.",
      items: [
        { icon: "⚠️", title: "Compliance Risk", text: "Manual tracking and no audit trail leaves organisations exposed to regulatory and reputational risk." },
        { icon: "💸", title: "High Costs", text: "In-person training is expensive to deliver, hard to scale, and impossible to standardise." },
        { icon: "📉", title: "Lost Revenue", text: "Organisations sitting on valuable expertise have no infrastructure to monetise it through courses." },
        { icon: "🔀", title: "Inconsistent Onboarding", text: "Every new hire, volunteer, or contractor gets a different experience." },
        { icon: "🔍", title: "No Audit Trail", text: "When funders, regulators, or auditors ask for evidence of training, you shouldn't be scrambling." },
        { icon: "🧩", title: "No Scalable Infrastructure", text: "Growth demands infrastructure. Without a central platform, training breaks down at scale." },
      ],
    },
    {
      id: "solution", type: "split", visible: true, anchor: "solution", tone: "dark",
      tag: "The Platform",
      title: "A full academy platform,\n*built for you.*",
      sub: "We don't sell courses — we give you the infrastructure to build your own: courses, modules, learners, instructors and admins, all under your own brand.",
      body: "Choose a design template, invite your team, and start teaching.",
      image: null, imageAlt: "", imageSide: "right",
      listTitle: "What every academy gets", listStyle: "numbered",
      list: [
        { title: "Your Own Branded Academy", text: "choose from multiple design templates" },
        { title: "Courses & Modules", text: "text, URL, Word, PDF or PowerPoint content" },
        { title: "Three Role-Based Views", text: "learner, instructor, and academy admin" },
        { title: "Paid or Free Enrolment", text: "sell courses and modules to your learners" },
        { title: "Secure Logins", text: "dedicated login & logout for every role" },
        { title: "Simple Subscription", text: "{{#trial}}{trial}, {{/trial}}cancel anytime" },
      ],
    },
    {
      id: "segments", type: "columns", visible: true, anchor: "segments", tone: "deep",
      tag: "Who We Serve",
      title: "Three sectors. One proven platform.",
      sub: "SkillsAcademy.ai is tailored to the governance, compliance, and growth needs of each sector.",
      items: [
        { icon: "🏢", title: "Businesses", bullets: ["Monetise your expertise through client academies", "Build certification pathways that increase retention", "Standardise client & staff onboarding at scale", "Create a new, recurring revenue stream", "Build thought leadership in your sector"] },
        { icon: "🤝", title: "Charities & Community Orgs", bullets: ["Train volunteers consistently and safely", "Reduce safeguarding and governance risk", "Improve credibility with funders", "Onboard new staff and volunteers quickly", "Demonstrate compliance to regulators"] },
        { icon: "🏛️", title: "Local Government & Public Sector", bullets: ["Standardise compliance across departments", "Manage contractor training and accountability", "Full audit trail for inspections and reporting", "CPD tracking and certification renewal", "Reduce cost vs in-person training delivery"] },
      ],
    },
    {
      id: "pricing", type: "pricing", visible: true, anchor: "pricing",
      tag: "Pricing",
      title: "One plan for your whole academy",
      sub: "{{#trial}}{{#allTrial}}Every plan includes{{else}}Plans include{{/allTrial}} a {trial}. No credit card charge until your trial ends, and you can change or cancel any time from your academy admin dashboard.{{else}}Choose the plan that fits your academy. You can change or cancel any time from your academy admin dashboard.{{/trial}}",
      ctaLabel: "Start Free Trial →", badge: "Most Popular",
    },
    {
      id: "how", type: "steps", visible: true, anchor: "how", tone: "dark",
      tag: "The Process",
      title: "From sign up to launch in minutes",
      items: [
        { title: "Create Your Academy", text: "Tell us about your organisation and choose your sector." },
        { title: "Pick a Template", text: "Choose a design template that matches your brand." },
        { title: "Choose a Plan", text: "Select {planNames}{{#trial}} — {trialDays} days free.{{else}}.{{/trial}}" },
        { title: "Add Courses & People", text: "Instructors build courses and modules; admins add learners." },
        { title: "Go Live", text: "Learners log in, enrol, pay where required, and start learning." },
      ],
    },
    {
      id: "contact", type: "cta", visible: true, anchor: "contact",
      tag: "Get Started",
      title: "Ready to build your academy?",
      text: "{{#trial}}Start your {trial} today. No commitment, cancel any time.{{else}}Get started today. No commitment, cancel any time.{{/trial}}",
      buttonLabel: "Create Your Academy →", buttonHref: "/signup",
    },
  ],
};

// ---------- Text tokens ----------
export interface TokenContext {
  hasTrial: boolean;
  allTrial: boolean;
  trial: string; // "14-day free trial"
  trialDays: string; // "14"
  trialAdjective: string; // "14-day"
  planCount: number;
  academyCount: number;
  planNames: string; // "Starter, Growth or Enterprise"
  year: number;
}
export const TOKEN_HELP: { token: string; meaning: string }[] = [
  { token: "{trial}", meaning: 'the trial, e.g. "14-day free trial"' },
  { token: "{trialDays}", meaning: 'its length, e.g. "14"' },
  { token: "{planCount}", meaning: "number of subscription plans" },
  { token: "{planNames}", meaning: 'the plan names, e.g. "Starter, Growth or Enterprise"' },
  { token: "{academyCount}", meaning: "number of academies on the platform" },
  { token: "{year}", meaning: "the current year" },
  { token: "{{#trial}}…{{else}}…{{/trial}}", meaning: "show the first text only while plans have a free trial" },
];

/** The values behind the tokens, from the live plans. */
export function buildTokenContext(plans: { name: string; trial_days: number }[], academyCount: number, now = new Date()): TokenContext {
  const trial = summariseTrials(plans);
  const names = plans.map((p) => p.name);
  return {
    hasTrial: trial.hasTrial,
    allTrial: allPlansHaveTrial(plans),
    trial: trial.phrase,
    trialDays: trial.number,
    trialAdjective: trial.adjective,
    planCount: plans.length,
    academyCount,
    planNames: names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`,
    year: now.getFullYear(),
  };
}

/** Fills in {tokens} and {{#trial}}…{{else}}…{{/trial}} (also {{#allTrial}}). */
export function applyTokens(text: string, ctx: TokenContext): string {
  let out = text;
  // Conditionals can nest one level (allTrial inside trial), so resolve innermost first.
  const cond = /\{\{#(trial|allTrial)\}\}((?:(?!\{\{#)[\s\S])*?)(?:\{\{else\}\}((?:(?!\{\{#)[\s\S])*?))?\{\{\/\1\}\}/g;
  for (let i = 0; i < 4 && /\{\{#/.test(out); i++) {
    out = out.replace(cond, (_m, name: string, a: string, b: string | undefined) => {
      const on = name === "trial" ? ctx.hasTrial : ctx.allTrial;
      return on ? a : (b ?? "");
    });
  }
  return out
    .replace(/\{trialDays\}/g, ctx.trialDays)
    .replace(/\{trial\}/g, ctx.trial)
    .replace(/\{planCount\}/g, String(ctx.planCount))
    .replace(/\{planNames\}/g, ctx.planNames)
    .replace(/\{academyCount\}/g, String(ctx.academyCount))
    .replace(/\{year\}/g, String(ctx.year));
}

// ---------- Sanitising ----------
function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
export function clampStr(v: unknown, max: number, fallback = ""): string {
  const s = typeof v === "string" ? v.replace(/\u0000/g, "").replace(/\r\n?/g, "\n").trim() : "";
  if (!s) return fallback;
  return s.length > max ? s.slice(0, max).trim() : s;
}
function oneLine(v: unknown, max: number, fallback = ""): string {
  return clampStr(typeof v === "string" ? v.replace(/\s*\n\s*/g, " ") : v, max, fallback);
}
export function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}
/** Internal paths, #anchors, https links and mailto only. Anything else becomes "". */
export function safeHref(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s || s.length > 300) return "";
  if (/[\u0000-\u001f\s]/.test(s)) return "";
  if (s.startsWith("#")) return /^#[A-Za-z0-9_-]{0,60}$/.test(s) ? s : "";
  if (s.startsWith("/")) return s.startsWith("//") || s.includes("\\") ? "" : s;
  if (/^https:\/\/[^\s/]+/i.test(s)) return s;
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(s)) return s;
  return "";
}
export function safeColor(v: unknown, fallback: string): string {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim().toLowerCase() : fallback;
}
function image(v: unknown): ImageKey | null {
  return typeof v === "string" && IMAGE_KEY_RE.test(v) ? v : null;
}
function anchorOf(v: unknown): string {
  return typeof v === "string" ? v.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) : "";
}
function list<T>(v: unknown, max: number, each: (x: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(v)) return [];
  const out: T[] = [];
  for (const x of v.slice(0, max)) {
    const r = rec(x);
    if (!r) continue;
    const item = each(r);
    if (item) out.push(item);
  }
  return out;
}
const toItem = (r: Record<string, unknown>): Item | null => {
  const title = oneLine(r.title, LIMITS.short);
  const text = clampStr(r.text, LIMITS.text);
  return title || text ? { icon: oneLine(r.icon, 8), title, text } : null;
};
const toStep = (r: Record<string, unknown>): StepItem | null => {
  const title = oneLine(r.title, LIMITS.short);
  const text = clampStr(r.text, LIMITS.text);
  return title || text ? { title, text } : null;
};
function links(v: unknown): LinkItem[] {
  return list(v, LIMITS.links, (r) => {
    const label = oneLine(r.label, 60);
    const href = safeHref(r.href);
    return label && href ? { label, href } : null;
  });
}

export function newSectionId(): string {
  return `s${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

/** A fresh, sensible section of a given type for the editor's "Add section". */
export function blankSection(type: SectionType): Section {
  const base = { id: newSectionId(), visible: true, anchor: "" };
  switch (type) {
    case "hero":
      return { ...base, type, tag: "", headline: "Your headline here", sub: "A sentence or two about what you offer.", primaryLabel: "", primaryHref: "/signup", secondaryLabel: "", secondaryHref: "", image: null, imageAlt: "", showStats: false, stats: [] };
    case "cards":
      return { ...base, type, tone: "light", tag: "Section label", title: "A heading for these cards", sub: "", columns: 3, items: [{ icon: "✨", title: "First point", text: "Say it in a sentence." }, { icon: "🎯", title: "Second point", text: "Say it in a sentence." }, { icon: "🚀", title: "Third point", text: "Say it in a sentence." }] };
    case "split":
      return { ...base, type, tone: "dark", tag: "Section label", title: "A heading", sub: "A short paragraph.", body: "", image: null, imageAlt: "", imageSide: "right", listTitle: "", listStyle: "bullets", list: [{ title: "First point", text: "" }, { title: "Second point", text: "" }] };
    case "columns":
      return { ...base, type, tone: "deep", tag: "Section label", title: "A heading", sub: "", items: [{ icon: "🏢", title: "First column", bullets: ["A point", "Another point"] }, { icon: "🤝", title: "Second column", bullets: ["A point", "Another point"] }] };
    case "steps":
      return { ...base, type, tone: "dark", tag: "Section label", title: "How it works", items: [{ title: "Step one", text: "Say what happens." }, { title: "Step two", text: "Say what happens." }, { title: "Step three", text: "Say what happens." }] };
    case "pricing":
      return { ...base, type, anchor: "pricing", tag: "Pricing", title: "Simple pricing", sub: "{{#trial}}Every plan includes a {trial}.{{/trial}}", ctaLabel: "Start Free Trial →", badge: "Most Popular" };
    case "banner":
      return { ...base, type, image: null, imageAlt: "", title: "A bold statement", text: "", buttonLabel: "", buttonHref: "", height: "medium" };
    case "text":
      return { ...base, type, tone: "light", tag: "", title: "A heading", body: "Write your paragraph here.\n\nBlank lines start a new paragraph.", align: "left" };
    case "cta":
      return { ...base, type, tag: "Get started", title: "Ready to begin?", text: "One sentence that nudges the visitor.", buttonLabel: "Create Your Academy →", buttonHref: "/signup" };
  }
}

/** One section from untrusted JSON, or null when it isn't a section we know. */
export function sanitizeSection(raw: unknown, usedIds?: Set<string>): Section | null {
  const r = rec(raw);
  if (!r) return null;
  const type = oneOf(r.type, SECTION_TYPES, "text" as SectionType);
  if (!(SECTION_TYPES as readonly string[]).includes(String(r.type))) return null;
  let id = typeof r.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(r.id) ? r.id : newSectionId();
  if (usedIds) {
    while (usedIds.has(id)) id = newSectionId();
    usedIds.add(id);
  }
  const base = { id, visible: r.visible !== false, anchor: anchorOf(r.anchor) };
  const tone = (fallback: Tone) => oneOf(r.tone, TONES, fallback);
  switch (type) {
    case "hero":
      return {
        ...base, type,
        tag: oneLine(r.tag, LIMITS.short),
        headline: clampStr(r.headline, LIMITS.title),
        sub: clampStr(r.sub, LIMITS.sub),
        primaryLabel: oneLine(r.primaryLabel, 60),
        primaryHref: safeHref(r.primaryHref) || "/signup",
        secondaryLabel: oneLine(r.secondaryLabel, 60),
        secondaryHref: safeHref(r.secondaryHref),
        image: image(r.image),
        imageAlt: oneLine(r.imageAlt, 160),
        showStats: r.showStats === true,
        stats: list(r.stats, LIMITS.stats, (x) => {
          const value = oneLine(x.value, 60);
          const label = oneLine(x.label, 100);
          return value || label ? { value, label } : null;
        }),
      };
    case "cards":
      return {
        ...base, type, tone: tone("light"),
        tag: oneLine(r.tag, LIMITS.short), title: clampStr(r.title, LIMITS.title), sub: clampStr(r.sub, LIMITS.sub),
        columns: r.columns === 2 || r.columns === 4 ? r.columns : 3,
        items: list(r.items, LIMITS.items, toItem),
      };
    case "split":
      return {
        ...base, type, tone: tone("dark"),
        tag: oneLine(r.tag, LIMITS.short), title: clampStr(r.title, LIMITS.title), sub: clampStr(r.sub, LIMITS.sub), body: clampStr(r.body, LIMITS.body),
        image: image(r.image), imageAlt: oneLine(r.imageAlt, 160),
        imageSide: oneOf(r.imageSide, ["left", "right"] as const, "right"),
        listTitle: oneLine(r.listTitle, LIMITS.short),
        listStyle: oneOf(r.listStyle, ["numbered", "bullets", "none"] as const, "bullets"),
        list: list(r.list, LIMITS.steps + 4, toStep),
      };
    case "columns":
      return {
        ...base, type, tone: tone("deep"),
        tag: oneLine(r.tag, LIMITS.short), title: clampStr(r.title, LIMITS.title), sub: clampStr(r.sub, LIMITS.sub),
        items: list(r.items, 4, (x) => {
          const title = oneLine(x.title, LIMITS.short);
          const bullets = (Array.isArray(x.bullets) ? x.bullets : []).slice(0, LIMITS.bullets).map((b) => oneLine(b, 200)).filter(Boolean);
          return title || bullets.length ? { icon: oneLine(x.icon, 8), title, bullets } : null;
        }),
      };
    case "steps":
      return { ...base, type, tone: tone("dark"), tag: oneLine(r.tag, LIMITS.short), title: clampStr(r.title, LIMITS.title), items: list(r.items, LIMITS.steps, toStep) };
    case "pricing":
      return {
        ...base, type,
        tag: oneLine(r.tag, LIMITS.short), title: clampStr(r.title, LIMITS.title), sub: clampStr(r.sub, LIMITS.sub),
        ctaLabel: oneLine(r.ctaLabel, 60, "Start Free Trial →"), badge: oneLine(r.badge, 40),
      };
    case "banner":
      return {
        ...base, type,
        image: image(r.image), imageAlt: oneLine(r.imageAlt, 160),
        title: clampStr(r.title, LIMITS.title), text: clampStr(r.text, LIMITS.sub),
        buttonLabel: oneLine(r.buttonLabel, 60), buttonHref: safeHref(r.buttonHref),
        height: oneOf(r.height, ["short", "medium", "tall"] as const, "medium"),
      };
    case "text":
      return { ...base, type, tone: tone("light"), tag: oneLine(r.tag, LIMITS.short), title: clampStr(r.title, LIMITS.title), body: clampStr(r.body, LIMITS.body), align: oneOf(r.align, ["left", "center"] as const, "left") };
    case "cta":
      return {
        ...base, type,
        tag: oneLine(r.tag, LIMITS.short), title: clampStr(r.title, LIMITS.title), text: clampStr(r.text, LIMITS.sub),
        buttonLabel: oneLine(r.buttonLabel, 60), buttonHref: safeHref(r.buttonHref) || "/signup",
      };
  }
}

/** The whole page from untrusted JSON; null when it isn't usable at all. */
export function sanitizePage(raw: unknown): HomePage | null {
  const r = rec(raw);
  if (!r || !Array.isArray(r.sections)) return null;
  const used = new Set<string>();
  const sections: Section[] = [];
  for (const s of r.sections.slice(0, LIMITS.sections)) {
    const clean = sanitizeSection(s, used);
    if (clean) sections.push(clean);
  }
  const theme = rec(r.theme) ?? {};
  const seo = rec(r.seo) ?? {};
  const nav = rec(r.nav) ?? {};
  const footer = rec(r.footer) ?? {};
  const d = DEFAULT_HOME_PAGE;
  return {
    version: 1,
    theme: { navy: safeColor(theme.navy, d.theme.navy), gold: safeColor(theme.gold, d.theme.gold) },
    seo: { title: oneLine(seo.title, 70), description: oneLine(seo.description, 200) },
    nav: {
      logoBefore: oneLine(nav.logoBefore, 30, ""),
      logoAccent: oneLine(nav.logoAccent, 30, ""),
      logoAfter: oneLine(nav.logoAfter, 30, ""),
      links: links(nav.links),
      loginLabel: oneLine(nav.loginLabel, 40, d.nav.loginLabel),
      ctaLabel: oneLine(nav.ctaLabel, 40, d.nav.ctaLabel),
    },
    footer: { text: oneLine(footer.text, 240), links: links(footer.links) },
    sections,
  };
}

/** Parses stored JSON; falls back to the original design when it is missing or damaged. */
export function parsePage(json: string | null | undefined): HomePage {
  if (json) {
    try {
      const p = sanitizePage(JSON.parse(json));
      if (p) return p;
    } catch {
      /* fall through */
    }
  }
  return structuredClone(DEFAULT_HOME_PAGE);
}

/** The picture keys a page refers to (so unused uploads can be told apart later). */
export function imagesIn(page: HomePage): ImageKey[] {
  const keys = new Set<ImageKey>();
  for (const s of page.sections) if ("image" in s && s.image) keys.add(s.image);
  return [...keys];
}

// ---------- AI rewrites change wording only ----------
const TEXT_FIELDS: Record<SectionType, string[]> = {
  hero: ["tag", "headline", "sub", "primaryLabel", "secondaryLabel", "imageAlt", "stats"],
  cards: ["tag", "title", "sub", "items"],
  split: ["tag", "title", "sub", "body", "imageAlt", "listTitle", "list"],
  columns: ["tag", "title", "sub", "items"],
  steps: ["tag", "title", "items"],
  pricing: ["tag", "title", "sub", "ctaLabel", "badge"],
  banner: ["title", "text", "buttonLabel", "imageAlt"],
  text: ["tag", "title", "body"],
  cta: ["tag", "title", "text", "buttonLabel"],
};
/** The original section with only the wording taken from a rewritten one — never links, pictures, layout or visibility. */
export function mergeWording(original: Section, rewritten: unknown): Section {
  const next = sanitizeSection({ ...(rec(rewritten) ?? {}), type: original.type, id: original.id });
  if (!next) return original;
  const merged: Record<string, unknown> = { ...original };
  for (const f of TEXT_FIELDS[original.type]) {
    const v = (next as unknown as Record<string, unknown>)[f];
    if (v !== undefined) merged[f] = v;
  }
  return sanitizeSection(merged) ?? original;
}
