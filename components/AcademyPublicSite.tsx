import Link from "next/link";
import type { ReactNode } from "react";
import type { Academy, Course, SiteBlock, Template, ModuleContentType } from "@/lib/queries";
import { formatGBP, formatDate } from "@/lib/utils";
import { resolveVideoEmbed } from "@/lib/videoEmbed";
import { contrastTextColor, contrastOverlayColor, linkColorOnWhite } from "@/lib/color";
import { learnItemsFor } from "@/lib/learnItems";
import { ACTIVITY_ICON } from "@/lib/activities";
import CourseArt from "@/components/CourseArt";
import { pickArt, usesDefaultEmoji } from "@/lib/courseArt";
import { MonitorIcon, ClockIcon, InfoIcon, TickIcon } from "@/components/courseIcons";

const CATEGORY_FALLBACK = "General";

function SiteBlockSection({ block, previewHidden = false }: { block: SiteBlock; previewHidden?: boolean }) {
  const wrap = (node: ReactNode) =>
    previewHidden ? (
      <div className="relative">
        <div className="absolute top-2 right-4 z-10 text-[10px] font-semibold uppercase tracking-wide bg-gray-900/80 text-white rounded-full px-2 py-0.5">
          Hidden from live site
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
    return wrap(<NewsBlock block={block} />);
  }
  return null;
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

function NewsBlock({ block }: { block: SiteBlock }) {
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
            News &middot; {formatDate(block.created_at)}
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">{block.title}</h3>
          {block.body_text && <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">{block.body_text}</p>}
        </div>
      </div>
    </section>
  );
}

type Outline = Record<string, { id: string; title: string; content_type: ModuleContentType }[]>;

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
  outlines = {},
  siteBlocks = [],
  preview = false,
}: {
  slug: string;
  academy: Academy;
  template: Template;
  courses: Course[];
  // Module titles per course id, for the course cards (see Modules.outlineByCourses).
  outlines?: Outline;
  siteBlocks?: SiteBlock[];
  preview?: boolean;
}) {
  // The homepage is deliberately minimal: the academy's title, its courses
  // (with their modules) and a "What you'll learn" section. A tagline and an
  // About section only appear if the admin has written them.
  const headline = academy.hero_headline || academy.name;
  const tagline = academy.hero_tagline;
  const about = academy.about_text;
  const learnItems = learnItemsFor(academy.learn_items, courses);

  const categories = Array.from(new Set(courses.map((c) => c.category || CATEGORY_FALLBACK)));

  // Templates are free-form hex colours the academy admin picks (including
  // the built-in "Light Minimal" preset, whose primary colour is a
  // near-white) — so the nav/hero/footer text colour below is computed
  // from the actual primary colour rather than hardcoded white, or a light
  // template would render invisible white-on-white text. See lib/color.ts.
  const textOnPrimary = contrastTextColor(template.primary_color);
  const mutedOnPrimary = contrastOverlayColor(template.primary_color, 0.7);
  // Text on the white course cards: the primary colour, unless it is too light to read (e.g. Light Minimal).
  const accentText = linkColorOnWhite(template.primary_color);
  // Solid button colour for "Start Learning": the primary colour, or near-black when that is too light (Light Minimal).
  const buttonBg = linkColorOnWhite(template.primary_color);
  const logoSrc = academy.logo_image_path ? `/api/academy-logo/${slug}?v=${encodeURIComponent(academy.updated_at)}` : null;

  return (
    <div
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
            <img src={logoSrc} alt={`${academy.name} logo`} className="h-10 max-w-[11rem] object-contain rounded-md bg-white px-2 py-1 flex-shrink-0" data-testid="academy-logo" />
          )}
          <div className="font-bold text-lg truncate">{academy.logo_text}</div>
        </div>
        <nav className="flex items-center gap-4">
          <Link href={`/a/${slug}/register`} className="text-sm font-semibold opacity-90 hover:opacity-100">
            Create account
          </Link>
          <Link
            href={`/a/${slug}/login`}
            className="text-sm font-semibold px-4 py-2 rounded-md"
            style={{ background: "var(--brand-accent)", color: "var(--brand-primary)" }}
          >
            Sign In
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

      {/* ABOUT — only when the admin has written one */}
      {about && (
        <section className="px-6 md:px-10 py-14 max-w-4xl mx-auto text-center">
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-4">About {academy.name}</h2>
          <p className="text-gray-600 leading-relaxed whitespace-pre-line">{about}</p>
        </section>
      )}

      {/* CUSTOM CONTENT — text sections, images, videos, news posts the
          academy admin has added, shown in the order they set. In preview
          mode, unpublished blocks are also shown (dimmed) so the admin can
          see what they've built before publishing; the live site only ever
          shows published ones. */}
      {siteBlocks
        .filter((b) => preview || b.is_published)
        .map((b) => (
          <SiteBlockSection key={b.id} block={b} previewHidden={preview && !b.is_published} />
        ))}

      {/* COURSES, each with its modules */}
      <section className="px-6 md:px-10 py-14 max-w-6xl mx-auto">
        <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-2 text-center">Our Courses</h2>
        <p className="text-gray-500 text-sm text-center mb-10">
          {courses.length > 0
            ? `${courses.length} course${courses.length === 1 ? "" : "s"} across ${categories.length} ${categories.length === 1 ? "category" : "categories"}. Create a free account to enrol.`
            : "Courses will appear here once published."}
        </p>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map((c) => {
            const modules = outlines[c.id] || [];
            const paid = c.price_pence > 0;
            const programName = c.category || CATEGORY_FALLBACK;
            const courseHref = `/a/${slug}/courses/${c.id}`;
            return (
              <div key={c.id} className="app-card overflow-hidden flex flex-col" data-testid="course-card">
                <Link href={courseHref} className="block" aria-label={`${c.title} — course details`}>
                  {c.cover_image_path ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/courses/${c.id}/cover?v=${encodeURIComponent(c.updated_at)}`} alt="" className="w-full aspect-[16/9] object-cover" />
                  ) : usesDefaultEmoji(c.cover_emoji) ? (
                    // No uploaded image and no emoji chosen: a picture matched to the course's topic.
                    <div className="w-full aspect-[16/9]">
                      <CourseArt kind={pickArt(c.title, c.category, c.description)} primary={template.primary_color} secondary={template.secondary_color} accent={template.accent_color} />
                    </div>
                  ) : (
                    <div
                      className="w-full aspect-[16/9] flex items-center justify-center text-5xl"
                      style={{ background: "linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))" }}
                    >
                      <span aria-hidden="true">{c.cover_emoji}</span>
                    </div>
                  )}
                </Link>
                <div className="p-5 pb-4">
                  <Link href={courseHref} className="font-semibold text-lg text-gray-900 hover:underline">
                    {c.title}
                  </Link>
                  <p className="text-sm text-gray-600 line-clamp-2 mt-1.5">{c.description || "No description yet."}</p>
                </div>

                {/* Course block: format, estimate, price box, Start Learning */}
                <div className="px-5 pb-5 grid gap-4">
                  <div className="grid gap-3 text-[15px] text-gray-900">
                    <div className="flex items-center gap-3">
                      <MonitorIcon />
                      <span>
                        <strong>Course Format</strong>: Self-Paced
                      </span>
                      <span className="text-gray-500" title="Learn at your own pace — there are no fixed start dates or deadlines.">
                        <InfoIcon size={18} />
                      </span>
                    </div>
                    {c.estimated_time && (
                      <div className="flex items-center gap-3">
                        <ClockIcon />
                        <span>
                          <strong>Estimated</strong>: {c.estimated_time}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="border-t border-gray-200" />
                  <div className="rounded-xl border border-gray-300 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-bold text-gray-900 text-lg leading-tight">{paid ? "Full Course" : "Learn for Free"}</div>
                      <div className="font-extrabold text-gray-900 text-2xl leading-none">{paid ? formatGBP(c.price_pence) : "Free"}</div>
                    </div>
                    <div className="font-semibold text-gray-900 text-sm mt-2">{paid ? "One-time purchase" : "Audit this course"}</div>
                    <ul className="mt-3 grid gap-1.5 text-sm text-gray-800">
                      <li className="flex gap-2 items-start">
                        <span style={{ color: "#2f7d32" }} className="mt-0.5">
                          <TickIcon />
                        </span>
                        Access to this course &amp; course materials
                      </li>
                      {!!c.certification_enabled && (
                        <li className="flex gap-2 items-start">
                          <span style={{ color: "#2f7d32" }} className="mt-0.5">
                            <TickIcon />
                          </span>
                          Certificate on completion
                        </li>
                      )}
                    </ul>
                  </div>
                  <Link
                    href={courseHref}
                    className="text-center rounded-md px-4 py-3 text-base font-semibold shadow-sm hover:opacity-90"
                    style={{ background: buttonBg, color: contrastTextColor(buttonBg) }}
                  >
                    Start Learning
                  </Link>
                </div>

                <div className="mt-auto bg-gray-100 border-t border-gray-200 px-5 py-5">
                  <div className="text-xs font-semibold tracking-[0.14em] text-gray-600 uppercase mb-3">Part of a program</div>
                  <div className="border-l-[3px] pl-4" style={{ borderColor: buttonBg }}>
                    <div className="font-bold text-gray-900 text-lg leading-tight">{programName}</div>
                    {modules.length > 0 ? (
                      <details className="text-sm text-gray-600 mt-1">
                        <summary className="cursor-pointer select-none">
                          Includes {modules.length} module{modules.length === 1 ? "" : "s"}
                          {paid ? " with a single purchase" : ""}
                        </summary>
                        <ul className="grid gap-1 mt-2 text-xs text-gray-700">
                          {modules.map((m) => (
                            <li key={m.id} className="flex gap-2">
                              <span aria-hidden="true">{ACTIVITY_ICON[m.content_type] ?? "📄"}</span>
                              <span className="min-w-0">{m.title}</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : (
                      <div className="text-sm text-gray-600 mt-1">Modules coming soon</div>
                    )}
                    <Link href={courseHref} className="inline-block mt-1.5 text-sm font-bold hover:underline" style={{ color: accentText }}>
                      View course details &gt;
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
          {courses.length === 0 && (
            <p className="text-sm text-gray-500 md:col-span-2 lg:col-span-3 text-center">No published courses yet.</p>
          )}
        </div>
      </section>

      {/* WHAT YOU'LL LEARN */}
      {learnItems.length > 0 && (
        <section className="px-6 md:px-10 pb-16 max-w-6xl mx-auto" data-testid="what-youll-learn">
          <div className="bg-white border border-gray-200 rounded-2xl px-6 md:px-10 py-8 md:py-10">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">What you&apos;ll learn</h2>
            <ul className="grid md:grid-cols-2 gap-x-12 gap-y-8">
              {learnItems.map((item, i) => (
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
      )}

      {/* FOOTER */}
      <footer
        className="px-6 md:px-10 py-8 text-center text-xs"
        style={{ background: "var(--brand-primary)", color: mutedOnPrimary }}
      >
        <div className="font-semibold mb-3" style={{ color: textOnPrimary }}>
          {academy.logo_text}
        </div>
        <div>
          Powered by{" "}
          <a href="https://skillsacademy.ai" className="underline" style={{ color: contrastOverlayColor(template.primary_color, 0.85) }}>
            SkillsAcademy.ai
          </a>
        </div>
      </footer>
    </div>
  );
}
