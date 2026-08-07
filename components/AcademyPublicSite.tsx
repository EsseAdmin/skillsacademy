import Link from "next/link";
import type { ReactNode } from "react";
import type { Academy, Course, SiteBlock, Template } from "@/lib/queries";
import { formatGBP, formatDate } from "@/lib/utils";
import { resolveVideoEmbed } from "@/lib/videoEmbed";

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

export default function AcademyPublicSite({
  slug,
  academy,
  template,
  courses,
  siteBlocks = [],
  preview = false,
}: {
  slug: string;
  academy: Academy;
  template: Template;
  courses: Course[];
  siteBlocks?: SiteBlock[];
  preview?: boolean;
}) {
  const headline = academy.hero_headline || academy.name;
  const tagline =
    academy.hero_tagline ||
    `Welcome to ${academy.name} — browse our courses and create a free account to start learning.`;
  const about =
    academy.about_text ||
    `${academy.name} runs its training and development programme right here. Create your own account, or log in if you already have one, to access your courses.`;

  const categories = Array.from(new Set(courses.map((c) => c.category || CATEGORY_FALLBACK)));

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
        style={{ background: "var(--brand-primary)", color: "#fff" }}
      >
        <div className="font-bold text-lg">{academy.logo_text}</div>
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

      {/* HERO */}
      <section
        className="px-6 md:px-10 py-16 md:py-24 text-center"
        style={{
          background: `linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))`,
          color: "#fff",
        }}
      >
        <div
          className="inline-block text-xs font-semibold uppercase tracking-wide rounded-full px-3 py-1 mb-5"
          style={{ background: "color-mix(in srgb, var(--brand-accent) 25%, transparent)", color: "var(--brand-accent)" }}
        >
          {academy.sector.replace("_", " ")}
        </div>
        <h1 className="text-3xl md:text-5xl font-bold max-w-3xl mx-auto leading-tight mb-5">{headline}</h1>
        <p className="text-base md:text-lg opacity-85 max-w-2xl mx-auto mb-8">{tagline}</p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link
            href={`/a/${slug}/register`}
            className="inline-block text-sm font-semibold px-6 py-3 rounded-md"
            style={{ background: "var(--brand-accent)", color: "var(--brand-primary)" }}
          >
            Create a Free Account →
          </Link>
          <Link
            href={`/a/${slug}/login`}
            className="inline-block text-sm font-semibold px-6 py-3 rounded-md border border-white/40"
          >
            Sign In
          </Link>
        </div>
      </section>

      {/* ABOUT */}
      <section className="px-6 md:px-10 py-14 max-w-4xl mx-auto text-center">
        <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-4">About {academy.name}</h2>
        <p className="text-gray-600 leading-relaxed whitespace-pre-line">{about}</p>
      </section>

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

      {/* CATALOG */}
      <section className="px-6 md:px-10 py-14 max-w-6xl mx-auto">
        <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-2 text-center">Our Courses</h2>
        <p className="text-gray-500 text-sm text-center mb-10">
          {courses.length > 0
            ? `${courses.length} course${courses.length === 1 ? "" : "s"} across ${categories.length} ${categories.length === 1 ? "category" : "categories"}. Create a free account to enrol.`
            : "Courses will appear here once published."}
        </p>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map((c) => (
            <Link key={c.id} href={`/a/${slug}/courses/${c.id}`} className="app-card p-5 block hover:shadow-md transition-shadow">
              <div className="text-3xl mb-3">{c.cover_emoji}</div>
              <div className="font-semibold text-gray-900 mb-1">{c.title}</div>
              <div className="text-xs text-gray-500 mb-3">{c.category || CATEGORY_FALLBACK}</div>
              <p className="text-sm text-gray-600 line-clamp-2 mb-4">{c.description || "No description yet."}</p>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold" style={{ color: "var(--brand-primary)" }}>
                  {c.price_pence > 0 ? formatGBP(c.price_pence) : "Free"}
                </span>
                <span className="font-semibold" style={{ color: "var(--brand-primary)" }}>
                  Learn more →
                </span>
              </div>
            </Link>
          ))}
          {courses.length === 0 && (
            <p className="text-sm text-gray-500 md:col-span-2 lg:col-span-3 text-center">No published courses yet.</p>
          )}
        </div>
      </section>

      {/* FOOTER */}
      <footer
        className="px-6 md:px-10 py-8 text-center text-xs"
        style={{ background: "var(--brand-primary)", color: "rgba(255,255,255,0.7)" }}
      >
        <div className="font-semibold text-white mb-1">{academy.logo_text}</div>
        <div className="mb-3">{academy.contact_email}</div>
        <div>
          Powered by{" "}
          <a href="https://skillsacademy.ai" className="underline" style={{ color: "rgba(255,255,255,0.85)" }}>
            SkillsAcademy.ai
          </a>
        </div>
      </footer>
    </div>
  );
}
