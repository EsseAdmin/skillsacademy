import Link from "next/link";
import type { ReactNode } from "react";
import type { Academy, Course, SiteBlock, Template } from "@/lib/queries";
import { formatDate } from "@/lib/utils";
import { getT, localeFor, normalizeLang, type TFunction } from "@/lib/i18n";
import { resolveVideoEmbed } from "@/lib/videoEmbed";
import { contrastTextColor, contrastOverlayColor } from "@/lib/color";
import { parseLearnItems } from "@/lib/learnItems";
import CourseCard from "@/components/CourseCard";
import { COURSE_TYPES, TYPE_ANCHOR, parseEnabledTypes, normalizeCourseType } from "@/lib/courseTypes";
import JourneyMap from "@/components/JourneyMap";
import type { JourneyView } from "@/lib/journeyTypes";

function SiteBlockSection({ block, previewHidden = false, t, locale }: { block: SiteBlock; previewHidden?: boolean; t: TFunction; locale: string }) {
  const wrap = (node: ReactNode) =>
    previewHidden ? (
      <div className="relative">
        <div className="absolute top-2 right-4 z-10 text-[10px] font-semibold uppercase tracking-wide bg-gray-900/80 text-white rounded-full px-2 py-0.5">
          {t("site_hidden_from_live")}
        </div>
        <div className="opacity-50">{node}</div>
      </div>
    ) : (
      node
    );

  if (block.block_type === "TEXT") {
    return wrap(<TextBlock block={block} />);
  }
  if (block.block_type === "IMAGE") {
    return wrap(<ImageBlock block={block} />);
  }
  if (block.block_type === "VIDEO" && block.video_url) {
    return wrap(<VideoBlock block={block} />);
  }
  if (block.block_type === "NEWS") {
    return wrap(<NewsBlock block={block} t={t} locale={locale} />);
  }
  if (block.block_type === "LEARN") {
    return wrap(<LearnBlock block={block} />);
  }
  return null;
}

// "What you'll learn": a checklist, one point per line of the section's text.
function LearnBlock({ block }: { block: SiteBlock }) {
  const items = parseLearnItems(block.body_text);
  if (items.length === 0) return null;
  return (
    <section className="px-6 md:px-10 py-10 max-w-6xl mx-auto" data-testid="what-youll-learn">
      <div className="bg-white border border-gray-200 rounded-2xl px-6 md:px-10 py-8 md:py-10">
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">{block.title}</h2>
        <ul className="grid md:grid-cols-2 gap-x-12 gap-y-8">
          {items.map((item, i) => (
            <li key={i} className="flex gap-4 items-start text-base md:text-lg text-gray-900 leading-snug">
              <span style={{ color: "#2f7d32" }}>
                <CheckIcon />
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function TextBlock({ block }: { block: SiteBlock }) {
  return (
    <section className="px-6 md:px-10 py-14 max-w-4xl mx-auto text-center">
      <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-4">{block.title}</h2>
      {block.body_text && <p className="text-gray-600 leading-relaxed whitespace-pre-line">{block.body_text}</p>}
    </section>
  );
}

function ImageBlock({ block }: { block: SiteBlock }) {
  return (
    <section className="px-6 md:px-10 py-14 max-w-4xl mx-auto text-center">
      <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-4">{block.title}</h2>
      {block.image_path && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/site-blocks/${block.id}/image`}
          alt={block.title}
          className="w-full rounded-lg shadow-sm mb-4"
        />
      )}
      {block.body_text && <p className="text-gray-500 text-sm">{block.body_text}</p>}
    </section>
  );
}

function VideoBlock({ block }: { block: SiteBlock }) {
  const embed = resolveVideoEmbed(block.video_url!);
  return (
    <section className="px-6 md:px-10 py-14 max-w-4xl mx-auto text-center">
      <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-4">{block.title}</h2>
      <div className="relative w-full rounded-lg overflow-hidden shadow-sm" style={{ paddingTop: "56.25%" }}>
        {embed.kind === "file" ? (
          <video controls className="absolute inset-0 w-full h-full bg-black">
            <source src={embed.src} />
          </video>
        ) : (
          <iframe
            src={embed.src}
            title={block.title}
            className="absolute inset-0 w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        )}
      </div>
      {block.body_text && <p className="text-gray-500 text-sm mt-4">{block.body_text}</p>}
    </section>
  );
}

function NewsBlock({ block, t, locale }: { block: SiteBlock; t: TFunction; locale: string }) {
  return (
    <section className="px-6 md:px-10 py-10 max-w-4xl mx-auto">
      <div className="app-card overflow-hidden md:flex">
        {block.image_path && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/site-blocks/${block.id}/image`}
            alt={block.title}
            className="w-full md:w-56 h-40 md:h-auto object-cover"
          />
        )}
        <div className="p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
            {t("site_news")} &middot; {formatDate(block.created_at, locale)}
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">{block.title}</h3>
          {block.body_text && <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">{block.body_text}</p>}
        </div>
      </div>
    </section>
  );
}


function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-shrink-0">
      <circle cx="12" cy="12" r="10" />
      <path d="m8 12.5 2.8 2.8L16 9.5" />
    </svg>
  );
}

export default function AcademyPublicSite({
  slug,
  academy,
  template,
  courses,
  stats = {},
  siteBlocks = [],
  journeys = [],
  preview = false,
}: {
  slug: string;
  academy: Academy;
  template: Template;
  courses: Course[];
  // Module count and total study minutes per course id (see Modules.statsByCourses).
  stats?: Record<string, { count: number; minutes: number }>;
  siteBlocks?: SiteBlock[];
  // Published learning journeys, drawn as metro maps (see lib/journeys.ts).
  journeys?: JourneyView[];
  preview?: boolean;
}) {
  // The homepage is deliberately minimal: the academy's title, its courses
  // (with their modules) and a "What you'll learn" section. A tagline and an
  // About section only appear if the admin has written them.
  const lang = normalizeLang(academy.language);
  const t = getT(lang);
  const locale = localeFor(lang);
  const headline = academy.hero_headline || academy.name;
  const tagline = academy.hero_tagline;

  // Only the course types this academy has switched on, in a fixed order, each with its courses.
  const enabledTypes = parseEnabledTypes(academy.enabled_course_types);
  const sections = COURSE_TYPES.filter((ty) => enabledTypes.includes(ty))
    .map((type) => ({ type, items: courses.filter((c) => normalizeCourseType(c.course_type) === type) }))
    .filter((sec) => sec.items.length > 0);

  // Templates are free-form hex colours the academy admin picks (including
  // the built-in "Light Minimal" preset, whose primary colour is a
  // near-white) — so the nav/hero/footer text colour below is computed
  // from the actual primary colour rather than hardcoded white, or a light
  // template would render invisible white-on-white text. See lib/color.ts.
  const textOnPrimary = contrastTextColor(template.primary_color);
  const mutedOnPrimary = contrastOverlayColor(template.primary_color, 0.7);
  // Text on the white course cards: the primary colour, unless it is too light to read (e.g. Light Minimal).
  const logoSrc = academy.logo_image_path ? `/api/academy-logo/${slug}?v=${encodeURIComponent(academy.updated_at)}` : null;

  return (
    <div
      lang={lang}
      style={{
        ["--brand-primary" as never]: template.primary_color,
        ["--brand-secondary" as never]: template.secondary_color,
        ["--brand-accent" as never]: template.accent_color,
        background: "#f6f7fb",
        minHeight: preview ? undefined : "100vh",
      }}
    >
      {/* NAV */}
      <header
        className="flex items-center justify-between px-6 md:px-10 py-4"
        style={{ background: "var(--brand-primary)", color: textOnPrimary }}
      >
        <div className="flex items-center gap-3 min-w-0">
          {logoSrc && (
            // The logo sits on a white chip so any logo (dark or light) stays readable on every template colour.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoSrc} alt={t("site_logo_alt", { name: academy.name })} className="h-10 max-w-[11rem] object-contain rounded-md bg-white px-2 py-1 flex-shrink-0" data-testid="academy-logo" />
          )}
          <div className="font-bold text-lg truncate">{academy.logo_text}</div>
        </div>
        <nav className="flex items-center gap-4">
          <Link href={`/a/${slug}/register`} className="text-sm font-semibold opacity-90 hover:opacity-100">
            {t("site_create_account")}
          </Link>
          <Link
            href={`/a/${slug}/login`}
            className="text-sm font-semibold px-4 py-2 rounded-md"
            style={{ background: "var(--brand-accent)", color: "var(--brand-primary)" }}
          >
            {t("site_sign_in")}
          </Link>
        </nav>
      </header>

      {/* HERO — the academy's title as it is */}
      <section
        className="px-6 md:px-10 py-16 md:py-20 text-center"
        style={{
          background: `linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))`,
          color: textOnPrimary,
        }}
      >
        <h1 className="text-3xl md:text-5xl font-bold max-w-3xl mx-auto leading-tight">{headline}</h1>
        {tagline && <p className="text-base md:text-lg opacity-85 max-w-2xl mx-auto mt-5">{tagline}</p>}
      </section>

      {/* CUSTOM CONTENT — text sections, images, videos, news posts the
          academy admin has added, shown in the order they set. In preview
          mode, unpublished blocks are also shown (dimmed) so the admin can
          see what they've built before publishing; the live site only ever
          shows published ones. */}
      {siteBlocks
        .filter((b) => preview || b.is_published)
        .map((b) => (
          <SiteBlockSection key={b.id} block={b} previewHidden={preview && !b.is_published} t={t} locale={locale} />
        ))}

      {/* COURSES — one section per course type that is switched on */}
      {sections.length === 0 ? (
        <section className="px-6 md:px-10 py-14 max-w-6xl mx-auto">
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-2 text-center">{t("site_our_courses")}</h2>
          <p className="text-gray-500 text-sm text-center">{t("site_courses_soon")}</p>
        </section>
      ) : (
        sections.map(({ type, items }) => (
          <section key={type} id={TYPE_ANCHOR[type]} className="px-6 md:px-10 pt-14 max-w-6xl mx-auto scroll-mt-4" data-testid="type-section" data-course-type={type}>
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-1">{t(`type_${type.toLowerCase()}` as "type_self_paced")}</h2>
            <p className="text-gray-500 text-sm mb-6">
              {t("site_count_courses", { n: items.length })}. {t(`type_${type.toLowerCase()}_desc` as "type_self_paced_desc")}
            </p>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {items.map((c) => (
                <CourseCard key={c.id} course={c} template={template} href={`/a/${slug}/courses/${c.id}`} t={t} locale={locale} stats={stats[c.id]} />
              ))}
            </div>
          </section>
        ))
      )}
      <div className="pb-14" />

      {/* LEARNING JOURNEYS — one metro-style map per published journey */}
      {journeys
        .filter((j) => j.stops && Object.values(j.stops).some((s) => s.length > 0))
        .map((j) => (
          <section key={j.id} className="px-6 md:px-10 pb-14 max-w-6xl mx-auto" data-testid="journey-section">
            <div className="bg-white border border-gray-200 rounded-2xl px-6 md:px-10 py-8 md:py-10">
              <div className="text-xs font-semibold tracking-[0.14em] text-gray-500 uppercase mb-2">{t("journey_heading")}</div>
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">{j.title}</h2>
              <p className="text-gray-500 text-sm mb-6">{j.description || t("journey_sub")}</p>
              <JourneyMap
                title={j.title}
                lines={j.lines}
                stations={j.stations}
                stops={j.stops}
                labels={{
                  pathways: t("journey_pathways"),
                  onPathways: t("journey_on_pathways"),
                  viewCourse: t("journey_view_course"),
                  openLink: t("journey_open_link"),
                  mapLabel: t("journey_map_label"),
                  selectHint: t("journey_select_hint"),
                  close: t("journey_close"),
                }}
              />
            </div>
          </section>
        ))}

      {/* FOOTER */}
      <footer
        className="px-6 md:px-10 py-8 text-center text-xs"
        style={{ background: "var(--brand-primary)", color: mutedOnPrimary }}
      >
        <div className="font-semibold mb-3" style={{ color: textOnPrimary }}>
          {academy.logo_text}
        </div>
        <div>
          {t("powered_by")}{" "}
          <a href="https://skillsacademy.ai" className="underline" style={{ color: contrastOverlayColor(template.primary_color, 0.85) }}>
            SkillsAcademy.ai
          </a>
        </div>
      </footer>
    </div>
  );
}
