import Link from "next/link";
import type { Academy, Course, Template } from "@/lib/queries";
import { formatGBP } from "@/lib/utils";

const CATEGORY_FALLBACK = "General";

export default function AcademyPublicSite({
  slug,
  academy,
  template,
  courses,
  preview = false,
}: {
  slug: string;
  academy: Academy;
  template: Template;
  courses: Course[];
  preview?: boolean;
}) {
  const headline = academy.hero_headline || academy.name;
  const tagline =
    academy.hero_tagline ||
    `Welcome to ${academy.name} — browse our courses and sign in to start learning.`;
  const about =
    academy.about_text ||
    `${academy.name} runs its training and development programme right here. Log in with the account your admin set up for you to access your courses.`;

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
        <Link
          href={`/a/${slug}/login`}
          className="inline-block text-sm font-semibold px-6 py-3 rounded-md"
          style={{ background: "var(--brand-accent)", color: "var(--brand-primary)" }}
        >
          Sign In to Your Academy →
        </Link>
      </section>

      {/* ABOUT */}
      <section className="px-6 md:px-10 py-14 max-w-4xl mx-auto text-center">
        <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-4">About {academy.name}</h2>
        <p className="text-gray-600 leading-relaxed whitespace-pre-line">{about}</p>
      </section>

      {/* CATALOG */}
      <section className="px-6 md:px-10 py-14 max-w-6xl mx-auto">
        <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-2 text-center">Our Courses</h2>
        <p className="text-gray-500 text-sm text-center mb-10">
          {courses.length > 0
            ? `${courses.length} course${courses.length === 1 ? "" : "s"} across ${categories.length} ${categories.length === 1 ? "category" : "categories"}. Sign in to enrol.`
            : "Courses will appear here once published."}
        </p>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map((c) => (
            <div key={c.id} className="app-card p-5">
              <div className="text-3xl mb-3">{c.cover_emoji}</div>
              <div className="font-semibold text-gray-900 mb-1">{c.title}</div>
              <div className="text-xs text-gray-500 mb-3">{c.category || CATEGORY_FALLBACK}</div>
              <p className="text-sm text-gray-600 line-clamp-2 mb-4">{c.description || "No description yet."}</p>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold" style={{ color: "var(--brand-primary)" }}>
                  {c.price_pence > 0 ? formatGBP(c.price_pence) : "Free"}
                </span>
                <Link href={`/a/${slug}/login`} className="font-semibold" style={{ color: "var(--brand-primary)" }}>
                  Sign in to enrol →
                </Link>
              </div>
            </div>
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
