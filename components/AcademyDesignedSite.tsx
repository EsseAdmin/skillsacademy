import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { Academy, Course, Template } from "@/lib/queries";
import { formatDate } from "@/lib/utils";
import { getT, localeFor, normalizeLang, type TFunction } from "@/lib/i18n";
import { resolveVideoEmbed } from "@/lib/videoEmbed";
import { contrastTextColor, contrastOverlayColor, linkColorOnWhite } from "@/lib/color";
import CourseCard from "@/components/CourseCard";
import JourneyMap from "@/components/JourneyMap";
import type { JourneyView } from "@/lib/journeyTypes";
import { COURSE_TYPES, TYPE_ANCHOR, parseEnabledTypes, normalizeCourseType } from "@/lib/courseTypes";
import {
  DEFAULT_BACKGROUND,
  FONTS,
  academyImageUrl,
  fillTokens,
  mixHex,
  type AcademyPage,
  type AcademySection,
} from "@/lib/academyPage";

// Renders an academy's designed public page (lib/academyPage.ts). A server component with
// no browser code apart from the journey maps, used for the live page and for the
// designer's preview alike. Colours come from the page's theme, falling back to the
// academy's Branding template, so a page that has never been recoloured still matches it.

interface Colors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
}
interface Surface {
  /** Background colour or gradient (undefined = the page background shows through). */
  bg?: string;
  fg: string;
  muted: string;
  tag: string;
  dark: boolean;
}

const HEADING: CSSProperties = { fontFamily: "var(--ad-heading)" };

function surfaceFor(s: AcademySection, c: Colors): Surface {
  const light = (): Surface => ({ fg: "#111827", muted: "#4b5563", tag: linkColorOnWhite(c.primary), dark: false });
  const onBg = (bg: string, over?: string): Surface => {
    const fg = contrastTextColor(bg);
    return { bg: over ?? bg, fg, muted: contrastOverlayColor(bg, 0.75), tag: contrastOverlayColor(bg, 0.7), dark: fg.toLowerCase() === "#ffffff" || fg.toLowerCase() === "#fff" };
  };
  if (s.bg) return onBg(s.bg);
  if ("tone" in s) {
    if (s.tone === "dark") return onBg(c.primary);
    if (s.tone === "deep") return onBg(mixHex(c.primary, [0, 0, 0], 0.3));
    return light();
  }
  switch (s.type) {
    case "hero":
      return onBg(c.primary, `linear-gradient(135deg, ${c.primary}, ${c.secondary})`);
    case "cta":
      return onBg(c.accent);
    default:
      return light();
  }
}

function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((ln, i) => (
        <span key={i}>
          {i > 0 && <br />}
          {ln.split(/(\*[^*]+\*)/g).map((part, j) => (/^\*[^*]+\*$/.test(part) ? <em key={j}>{part.slice(1, -1)}</em> : part))}
        </span>
      ))}
    </>
  );
}

function paragraphs(text: string): string[] {
  return text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
}

function SmartLink({ href, className, style, children }: { href: string; className?: string; style?: CSSProperties; children: ReactNode }) {
  if (href.startsWith("/") && !href.startsWith("//")) {
    return (
      <Link href={href} className={className} style={style}>
        {children}
      </Link>
    );
  }
  const external = href.startsWith("https://");
  return (
    <a href={href} className={className} style={style} {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}>
      {children}
    </a>
  );
}

function Head({ tag, title, sub, surf, center = false, as = "h2" }: { tag?: string; title?: string; sub?: string; surf: Surface; center?: boolean; as?: "h2" | "h1" }) {
  const Title = as;
  return (
    <div className={`mb-8 ${center ? "text-center" : ""}`}>
      {tag && (
        <div className="text-xs font-semibold tracking-[0.14em] uppercase mb-2" style={{ color: surf.tag }}>
          {tag}
        </div>
      )}
      {title && (
        <Title className="text-2xl md:text-3xl font-bold leading-tight" style={HEADING}>
          <Rich text={title} />
        </Title>
      )}
      {sub && (
        <p className={`mt-3 text-base leading-relaxed max-w-3xl ${center ? "mx-auto" : ""}`} style={{ color: surf.muted }}>
          {sub}
        </p>
      )}
    </div>
  );
}

function cardStyle(surf: Surface): CSSProperties {
  return surf.dark ? { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)" } : { background: "#ffffff", border: "1px solid #e5e7eb" };
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-shrink-0">
      <circle cx="12" cy="12" r="10" />
      <path d="m8 12.5 2.8 2.8L16 9.5" />
    </svg>
  );
}

interface Ctx {
  slug: string;
  academy: Academy;
  colors: Colors;
  template: Template;
  courses: Course[];
  stats: Record<string, { count: number; minutes: number }>;
  journeys: JourneyView[];
  t: TFunction;
  locale: string;
  fill: (s: string) => string;
}

const GRID = { 2: "md:grid-cols-2", 3: "md:grid-cols-2 lg:grid-cols-3", 4: "md:grid-cols-2 lg:grid-cols-4" } as const;
const BANNER_H = { short: "min-h-[14rem]", medium: "min-h-[22rem]", tall: "min-h-[32rem]" } as const;

function Wrap({ s, surf, narrow, children, testid }: { s: AcademySection; surf: Surface; narrow?: boolean; children: ReactNode; testid?: string }) {
  return (
    <section id={s.anchor || undefined} className="px-6 md:px-10 py-12 md:py-14 scroll-mt-4" style={{ background: surf.bg, color: surf.fg }} data-testid={testid ?? "design-section"} data-section-type={s.type}>
      <div className={`${narrow ? "max-w-4xl" : "max-w-6xl"} mx-auto`}>{children}</div>
    </section>
  );
}

function SectionView({ s, cx }: { s: AcademySection; cx: Ctx }) {
  const { fill, slug, colors, t } = cx;
  const surf = surfaceFor(s, colors);
  switch (s.type) {
    case "hero": {
      const label = s.primaryLabel ? fill(s.primaryLabel) : t("site_create_account");
      return (
        <section id={s.anchor || undefined} className="px-6 md:px-10 py-16 md:py-20 scroll-mt-4" style={{ background: surf.bg, color: surf.fg }} data-testid="design-hero" data-section-type="hero">
          <div className={`max-w-6xl mx-auto ${s.image ? "grid md:grid-cols-2 gap-10 items-center" : "text-center"}`}>
            <div>
              {s.tag && (
                <div className="text-xs font-semibold tracking-[0.14em] uppercase mb-3" style={{ color: surf.tag }}>
                  {fill(s.tag)}
                </div>
              )}
              <h1 className="text-3xl md:text-5xl font-bold leading-tight" style={HEADING}>
                <Rich text={fill(s.headline || cx.academy.name)} />
              </h1>
              {s.sub && (
                <p className={`text-base md:text-lg mt-5 ${s.image ? "" : "max-w-2xl mx-auto"}`} style={{ color: surf.muted }}>
                  {fill(s.sub)}
                </p>
              )}
              <div className={`flex flex-wrap gap-3 mt-7 ${s.image ? "" : "justify-center"}`}>
                <SmartLink href={s.primaryHref || `/a/${slug}/register`} className="text-sm font-semibold px-6 py-3 rounded-md" style={{ background: colors.accent, color: contrastTextColor(colors.accent) }}>
                  {label}
                </SmartLink>
                {s.secondaryLabel && s.secondaryHref && (
                  <SmartLink href={s.secondaryHref} className="text-sm font-semibold px-6 py-3 rounded-md border" style={{ borderColor: surf.muted, color: surf.fg }}>
                    {fill(s.secondaryLabel)}
                  </SmartLink>
                )}
              </div>
            </div>
            {s.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={academyImageUrl(slug, s.image)} alt={s.imageAlt} className="w-full rounded-xl shadow-lg" data-testid="hero-image" />
            )}
          </div>
        </section>
      );
    }
    case "text":
      return (
        <Wrap s={s} surf={surf} narrow>
          <div className={s.align === "center" ? "text-center" : ""}>
            <Head tag={fill(s.tag)} title={fill(s.title)} surf={surf} center={s.align === "center"} />
            {paragraphs(fill(s.body)).map((p, i) => (
              <p key={i} className="leading-relaxed whitespace-pre-line mb-4" style={{ color: surf.muted }}>
                {p}
              </p>
            ))}
          </div>
        </Wrap>
      );
    case "banner":
      return (
        <section id={s.anchor || undefined} className={`relative overflow-hidden flex items-center justify-center text-center px-6 py-14 scroll-mt-4 ${BANNER_H[s.height]}`} style={{ background: s.bg || cx.colors.primary, color: "#fff" }} data-testid="design-section" data-section-type="banner">
          {s.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={academyImageUrl(slug, s.image)} alt={s.imageAlt} className="absolute inset-0 w-full h-full object-cover" data-testid="banner-image" />
          )}
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.45)" }} />
          <div className="relative max-w-3xl">
            {s.title && (
              <h2 className="text-3xl md:text-4xl font-bold leading-tight" style={HEADING}>
                <Rich text={fill(s.title)} />
              </h2>
            )}
            {s.text && <p className="mt-4 text-lg" style={{ color: "rgba(255,255,255,0.88)" }}>{fill(s.text)}</p>}
            {s.buttonLabel && s.buttonHref && (
              <SmartLink href={s.buttonHref} className="inline-block mt-6 text-sm font-semibold px-6 py-3 rounded-md" style={{ background: colors.accent, color: contrastTextColor(colors.accent) }}>
                {fill(s.buttonLabel)}
              </SmartLink>
            )}
          </div>
        </section>
      );
    case "video": {
      if (!s.url) return null;
      const embed = resolveVideoEmbed(s.url);
      return (
        <Wrap s={s} surf={surf} narrow>
          <div className="text-center">
            <Head title={fill(s.title)} surf={surf} center />
          </div>
          <div className="relative w-full rounded-lg overflow-hidden shadow-sm" style={{ paddingTop: "56.25%" }}>
            {embed.kind === "file" ? (
              <video controls className="absolute inset-0 w-full h-full bg-black">
                <source src={embed.src} />
              </video>
            ) : (
              <iframe src={embed.src} title={s.title || "Video"} className="absolute inset-0 w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
            )}
          </div>
          {s.caption && <p className="text-sm mt-4 text-center" style={{ color: surf.muted }}>{fill(s.caption)}</p>}
        </Wrap>
      );
    }
    case "news":
      return (
        <Wrap s={s} surf={surf} narrow>
          <article className="rounded-xl overflow-hidden md:flex" style={cardStyle(surf)} data-testid="design-news">
            {s.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={academyImageUrl(slug, s.image)} alt={s.imageAlt} className="w-full md:w-60 h-44 md:h-auto object-cover" />
            )}
            <div className="p-6">
              <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: surf.muted }}>
                {[s.tag ? fill(s.tag) : t("site_news"), s.date ? formatDate(s.date, cx.locale) : ""].filter(Boolean).join(" · ")}
              </div>
              <h3 className="text-lg font-bold mb-2" style={HEADING}>{fill(s.title)}</h3>
              {s.body && <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: surf.muted }}>{fill(s.body)}</p>}
            </div>
          </article>
        </Wrap>
      );
    case "learn":
      if (s.points.length === 0) return null;
      return (
        <Wrap s={s} surf={surf} testid="what-youll-learn">
          <div className="rounded-2xl px-6 md:px-10 py-8 md:py-10" style={cardStyle(surf)}>
            <h2 className="text-2xl md:text-3xl font-bold mb-8" style={HEADING}>{fill(s.title)}</h2>
            <ul className="grid md:grid-cols-2 gap-x-12 gap-y-6">
              {s.points.map((p, i) => (
                <li key={i} className="flex gap-4 items-start text-base md:text-lg leading-snug">
                  <span style={{ color: "#2f7d32" }}>
                    <CheckIcon />
                  </span>
                  <span>{fill(p)}</span>
                </li>
              ))}
            </ul>
          </div>
        </Wrap>
      );
    case "cards":
      return (
        <Wrap s={s} surf={surf}>
          <Head tag={fill(s.tag)} title={fill(s.title)} sub={fill(s.sub)} surf={surf} />
          <div className={`grid gap-5 ${GRID[s.columns]}`}>
            {s.items.map((it, i) => (
              <div key={i} className="rounded-xl p-6" style={cardStyle(surf)}>
                {it.icon && <div className="text-2xl mb-3">{it.icon}</div>}
                <h3 className="font-bold mb-1.5" style={HEADING}>{fill(it.title)}</h3>
                <p className="text-sm leading-relaxed" style={{ color: surf.muted }}>{fill(it.text)}</p>
              </div>
            ))}
          </div>
        </Wrap>
      );
    case "split": {
      const list = s.listStyle !== "none" && s.list.length > 0;
      const visual = s.image || list;
      return (
        <Wrap s={s} surf={surf}>
          <div className={`grid gap-10 items-center ${visual ? "md:grid-cols-2" : ""}`}>
            <div className={s.imageSide === "left" ? "md:order-2" : ""}>
              <Head tag={fill(s.tag)} title={fill(s.title)} sub={fill(s.sub)} surf={surf} />
              {paragraphs(fill(s.body)).map((p, i) => (
                <p key={i} className="leading-relaxed mb-3" style={{ color: surf.muted }}>{p}</p>
              ))}
            </div>
            {visual && (
              <div className={s.imageSide === "left" ? "md:order-1" : ""}>
                {s.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={academyImageUrl(slug, s.image)} alt={s.imageAlt} className="w-full rounded-xl shadow-md" data-testid="split-image" />
                )}
                {list && (
                  <div className={`rounded-xl p-6 ${s.image ? "mt-6" : ""}`} style={cardStyle(surf)}>
                    {s.listTitle && <h3 className="font-bold mb-4" style={HEADING}>{fill(s.listTitle)}</h3>}
                    <ul className="grid gap-3">
                      {s.list.map((li, i) => (
                        <li key={i} className="flex gap-3 items-start text-sm">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center" style={{ background: colors.accent, color: contrastTextColor(colors.accent) }}>
                            {s.listStyle === "numbered" ? i + 1 : ""}
                          </span>
                          <span>
                            <strong>{fill(li.title)}</strong>
                            {li.text ? <span style={{ color: surf.muted }}>{` — ${fill(li.text)}`}</span> : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </Wrap>
      );
    }
    case "columns":
      return (
        <Wrap s={s} surf={surf}>
          <Head tag={fill(s.tag)} title={fill(s.title)} sub={fill(s.sub)} surf={surf} />
          <div className={`grid gap-5 ${s.items.length >= 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
            {s.items.map((it, i) => (
              <div key={i} className="rounded-xl p-6" style={cardStyle(surf)}>
                {it.icon && <div className="text-2xl mb-2">{it.icon}</div>}
                <h3 className="font-bold mb-3" style={HEADING}>{fill(it.title)}</h3>
                <ul className="grid gap-2 text-sm" style={{ color: surf.muted }}>
                  {it.bullets.map((b, j) => (
                    <li key={j} className="flex gap-2">
                      <span style={{ color: colors.accent }}>✦</span>
                      <span>{fill(b)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Wrap>
      );
    case "steps":
      return (
        <Wrap s={s} surf={surf}>
          <Head tag={fill(s.tag)} title={fill(s.title)} surf={surf} center />
          <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(11rem, 1fr))` }}>
            {s.items.map((it, i) => (
              <div key={i} className="text-center">
                <div className="w-11 h-11 rounded-full mx-auto mb-3 flex items-center justify-center font-bold" style={{ background: colors.accent, color: contrastTextColor(colors.accent) }}>
                  {i + 1}
                </div>
                <h4 className="font-bold mb-1" style={HEADING}>{fill(it.title)}</h4>
                <p className="text-sm" style={{ color: surf.muted }}>{fill(it.text)}</p>
              </div>
            ))}
          </div>
        </Wrap>
      );
    case "cta":
      return (
        <Wrap s={s} surf={surf} narrow>
          <div className="text-center">
            {s.tag && <div className="text-xs font-semibold tracking-[0.14em] uppercase mb-2" style={{ color: surf.tag }}>{fill(s.tag)}</div>}
            <h2 className="text-2xl md:text-3xl font-bold" style={HEADING}><Rich text={fill(s.title)} /></h2>
            {s.text && <p className="mt-3" style={{ color: surf.muted }}>{fill(s.text)}</p>}
            {s.buttonLabel && (
              <SmartLink href={s.buttonHref || `/a/${slug}/register`} className="inline-block mt-6 text-sm font-semibold px-6 py-3 rounded-md" style={{ background: surf.dark ? "#ffffff" : colors.primary, color: surf.dark ? "#111827" : contrastTextColor(colors.primary) }}>
                {fill(s.buttonLabel)}
              </SmartLink>
            )}
          </div>
        </Wrap>
      );
    case "courses":
      return <CoursesView s={s} cx={cx} surf={surf} />;
    case "journeys":
      return <JourneysView s={s} cx={cx} surf={surf} />;
  }
}

function CoursesView({ s, cx, surf }: { s: Extract<AcademySection, { type: "courses" }>; cx: Ctx; surf: Surface }) {
  const { slug, t, locale, fill } = cx;
  const enabled = parseEnabledTypes(cx.academy.enabled_course_types);
  const groups = COURSE_TYPES.filter((ty) => enabled.includes(ty))
    .map((type) => ({ type, items: cx.courses.filter((c) => normalizeCourseType(c.course_type) === type) }))
    .filter((g) => g.items.length > 0);
  const card = (c: Course) => <CourseCard key={c.id} course={c} template={cx.template} href={`/a/${slug}/courses/${c.id}`} t={t} locale={locale} stats={cx.stats[c.id]} />;
  const intro = (s.title || s.sub) && <Head title={s.title ? fill(s.title) : undefined} sub={s.sub ? fill(s.sub) : undefined} surf={surf} />;

  if (groups.length === 0) {
    return (
      <Wrap s={s} surf={surf}>
        <div className="text-center" data-testid="courses-empty">
          <h2 className="text-xl md:text-2xl font-bold mb-2" style={HEADING}>{s.title ? fill(s.title) : t("site_our_courses")}</h2>
          <p className="text-sm" style={{ color: surf.muted }}>{t("site_courses_soon")}</p>
        </div>
      </Wrap>
    );
  }
  if (s.grouping === "all") {
    const all = groups.flatMap((g) => g.items);
    return (
      <Wrap s={s} surf={surf} testid="type-section">
        {s.title || s.sub ? intro : <Head title={t("site_our_courses")} surf={surf} />}
        <div className={`grid gap-5 ${GRID[s.columns]}`}>{all.map(card)}</div>
      </Wrap>
    );
  }
  return (
    <>
      {groups.map(({ type, items }, i) => (
        <section key={type} id={i === 0 && s.anchor ? s.anchor : TYPE_ANCHOR[type]} className="px-6 md:px-10 pt-12 pb-6 scroll-mt-4" style={{ background: surf.bg, color: surf.fg }} data-testid="type-section" data-course-type={type} data-section-type="courses">
          <div className="max-w-6xl mx-auto">
            {i === 0 && intro}
            <h2 className="text-xl md:text-2xl font-bold mb-1" style={HEADING}>{t(`type_${type.toLowerCase()}` as "type_self_paced")}</h2>
            <p className="text-sm mb-6" style={{ color: surf.muted }}>
              {t("site_count_courses", { n: items.length })}. {t(`type_${type.toLowerCase()}_desc` as "type_self_paced_desc")}
            </p>
            <div className={`grid gap-5 ${GRID[s.columns]}`}>{items.map(card)}</div>
          </div>
        </section>
      ))}
    </>
  );
}

function JourneysView({ s, cx, surf }: { s: Extract<AcademySection, { type: "journeys" }>; cx: Ctx; surf: Surface }) {
  const { t, fill } = cx;
  const shown = cx.journeys.filter((j) => j.stops && Object.values(j.stops).some((st) => st.length > 0));
  if (shown.length === 0) return null;
  return (
    <section id={s.anchor || undefined} className="px-6 md:px-10 py-10 scroll-mt-4" style={{ background: surf.bg, color: surf.fg }} data-section-type="journeys">
      <div className="max-w-6xl mx-auto grid gap-6">
        {shown.map((j) => (
          <div key={j.id} className="rounded-2xl px-6 md:px-10 py-8 md:py-10 bg-white text-gray-900 border border-gray-200" data-testid="journey-section">
            <div className="text-xs font-semibold tracking-[0.14em] text-gray-500 uppercase mb-2">{s.title ? fill(s.title) : t("journey_heading")}</div>
            <h2 className="text-2xl md:text-3xl font-bold mb-2" style={HEADING}>{j.title}</h2>
            <p className="text-gray-500 text-sm mb-6">{j.description || (s.sub ? fill(s.sub) : t("journey_sub"))}</p>
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
        ))}
      </div>
    </section>
  );
}

export default function AcademyDesignedSite({
  slug,
  academy,
  template,
  page,
  courses,
  stats = {},
  journeys = [],
  preview = false,
}: {
  slug: string;
  academy: Academy;
  template: Template;
  page: AcademyPage;
  courses: Course[];
  stats?: Record<string, { count: number; minutes: number }>;
  journeys?: JourneyView[];
  preview?: boolean;
}) {
  const lang = normalizeLang(academy.language);
  const t = getT(lang);
  const locale = localeFor(lang);
  const th = page.theme;
  const colors: Colors = {
    primary: th.primary || template.primary_color,
    secondary: th.secondary || template.secondary_color,
    accent: th.accent || template.accent_color,
    background: th.background || DEFAULT_BACKGROUND,
  };
  const effective: Template = { ...template, primary_color: colors.primary, secondary_color: colors.secondary, accent_color: colors.accent };
  const fill = (s: string) => fillTokens(s, { name: academy.name });
  const cx: Ctx = { slug, academy, colors, template: effective, courses, stats, journeys, t, locale, fill };

  const logoSrc = academy.logo_image_path ? `/api/academy-logo/${slug}?v=${encodeURIComponent(academy.updated_at)}` : null;
  const headerBrand = page.header.style === "brand";
  const headerFg = headerBrand ? contrastTextColor(colors.primary) : "#111827";
  const footerBrand = page.footer.style === "brand";
  const footerFg = footerBrand ? contrastTextColor(colors.primary) : "#111827";
  const footerMuted = footerBrand ? contrastOverlayColor(colors.primary, 0.7) : "#6b7280";

  return (
    <div
      lang={lang}
      data-testid="designed-site"
      style={{
        ["--brand-primary" as never]: colors.primary,
        ["--brand-secondary" as never]: colors.secondary,
        ["--brand-accent" as never]: colors.accent,
        ["--ad-heading" as never]: FONTS[th.headingFont].stack,
        fontFamily: FONTS[th.bodyFont].stack,
        background: colors.background,
        minHeight: preview ? undefined : "100vh",
      }}
    >
      <header
        className="flex flex-wrap items-center justify-between gap-3 px-6 md:px-10 py-4"
        style={{ background: headerBrand ? colors.primary : "#ffffff", color: headerFg, borderBottom: headerBrand ? undefined : "1px solid #e5e7eb" }}
        data-testid="design-header"
      >
        <div className="flex items-center gap-3 min-w-0">
          {logoSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoSrc} alt={t("site_logo_alt", { name: academy.name })} className="h-10 max-w-[11rem] object-contain rounded-md bg-white px-2 py-1 flex-shrink-0" data-testid="academy-logo" />
          )}
          <div className="font-bold text-lg truncate" style={HEADING}>{academy.logo_text}</div>
        </div>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {page.header.links.map((l) => (
            <SmartLink key={l.label + l.href} href={l.href} className="text-sm font-semibold opacity-90 hover:opacity-100">
              {l.label}
            </SmartLink>
          ))}
          <Link href={`/a/${slug}/register`} className="text-sm font-semibold opacity-90 hover:opacity-100">
            {page.header.registerLabel || t("site_create_account")}
          </Link>
          <Link href={`/a/${slug}/login`} className="text-sm font-semibold px-4 py-2 rounded-md" style={{ background: colors.accent, color: contrastTextColor(colors.accent) }}>
            {page.header.signInLabel || t("site_sign_in")}
          </Link>
        </nav>
      </header>

      {page.sections
        .filter((s) => s.visible)
        .map((s) => (
          <SectionView key={s.id} s={s} cx={cx} />
        ))}

      <footer className="px-6 md:px-10 py-8 text-center text-xs mt-6" style={{ background: footerBrand ? colors.primary : "#ffffff", color: footerMuted, borderTop: footerBrand ? undefined : "1px solid #e5e7eb" }} data-testid="design-footer">
        <div className="font-semibold mb-3" style={{ color: footerFg }}>
          {page.footer.text ? fill(page.footer.text) : academy.logo_text}
        </div>
        {page.footer.links.length > 0 && (
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 mb-3">
            {page.footer.links.map((l) => (
              <SmartLink key={l.label + l.href} href={l.href} className="underline" style={{ color: footerFg }}>
                {l.label}
              </SmartLink>
            ))}
          </div>
        )}
        <div>
          {t("powered_by")}{" "}
          <a href="https://skillsacademy.ai" className="underline" style={{ color: footerBrand ? contrastOverlayColor(colors.primary, 0.85) : "#374151" }}>
            SkillsAcademy.ai
          </a>
        </div>
      </footer>
    </div>
  );
}
