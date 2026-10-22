import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Academies, Templates, Courses, Plans, Modules, Enrollments } from "@/lib/queries";
import { themeVars } from "@/lib/theme";
import { formatGBP } from "@/lib/utils";
import { hasSeoTier } from "@/lib/seoTiers";
import { contrastTextColor } from "@/lib/color";
import { getSession } from "@/lib/auth";
import { enrollFree } from "@/lib/actions/learning";
import { ACTIVITY_ICON } from "@/lib/activities";
import CourseArt from "@/components/CourseArt";
import ModuleThumb from "@/components/ModuleThumb";
import { pickArt, usesDefaultEmoji } from "@/lib/courseArt";
import { MonitorIcon, ClockIcon, TickIcon } from "@/components/courseIcons";

async function loadCoursePage(slug: string, id: string) {
  const academy = await Academies.bySlug(slug);
  if (!academy || !academy.is_published) return null;
  const course = await Courses.byId(id);
  if (!course || course.academy_id !== academy.id || !course.is_published) return null;
  return { academy, course };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; id: string }> }): Promise<Metadata> {
  const { slug, id } = await params;
  const data = await loadCoursePage(slug, id);
  if (!data) return {};
  const { academy, course } = data;
  const title = course.seo_meta_title || `${course.title} | ${academy.name}`;
  const description = course.seo_meta_description || course.description || `Learn ${course.title} at ${academy.name}.`;
  const plan = await Plans.byId(academy.plan_id);
  const ogImage = plan && hasSeoTier(plan.key, "growth") && course.seo_og_image_path ? `/api/courses/${course.id}/og-image` : undefined;

  return {
    title,
    description,
    openGraph: { title, description, images: ogImage ? [ogImage] : undefined },
    twitter: { card: "summary_large_image", title, description, images: ogImage ? [ogImage] : undefined },
  };
}

export default async function PublicCoursePage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const data = await loadCoursePage(slug, id);
  if (!data) notFound();
  const { academy, course } = data;
  const template = (await Templates.byId(academy.template_id))!;
  const plan = await Plans.byId(academy.plan_id);
  const schemaEnabled = plan ? hasSeoTier(plan.key, "growth") : false;
  const modules = await Modules.listByCourse(course.id);

  const textOnPrimary = contrastTextColor(template.primary_color);
  const paid = course.price_pence > 0;
  const logoSrc = academy.logo_image_path ? `/api/academy-logo/${slug}?v=${encodeURIComponent(academy.updated_at)}` : null;

  // What the two hero buttons do depends on who is looking. Only a learner of
  // THIS academy counts as signed in here; everyone else (visitors, staff,
  // people from other academies) is sent through sign-in / create-account and
  // returned to this course afterwards.
  const session = await getSession();
  const learner = session && session.role === "LEARNER" && session.academySlug === slug ? session : null;
  const enrollment = learner ? await Enrollments.byCourseAndLearner(course.id, learner.userId) : undefined;
  const courseHome = `/a/${slug}/learner/courses/${course.id}`;
  const checkoutHref = `/a/${slug}/learner/checkout/${course.id}`;
  const boundEnroll = enrollFree.bind(null, slug);

  const startBtnStyle = { background: textOnPrimary, color: template.primary_color } as const;
  const startBtnClass = "inline-block text-center text-base font-semibold px-8 py-3.5 rounded-md shadow-sm hover:opacity-90";
  const enrolBtnStyle = { borderColor: textOnPrimary, color: textOnPrimary } as const;
  const enrolBtnClass = "inline-block text-center text-base font-semibold px-8 py-3.5 rounded-md border-2 hover:bg-white/10";

  // A form button that enrols the signed-in learner (free: straight in; paid: on to checkout).
  const enrolForm = (label: string, style: typeof startBtnStyle | typeof enrolBtnStyle, cls: string, testId: string) => (
    <form action={boundEnroll}>
      <input type="hidden" name="courseId" value={course.id} />
      <button type="submit" className={cls} style={style} data-testid={testId}>
        {label}
      </button>
    </form>
  );

  let startButton;
  let enrolButton;
  if (learner && enrollment && enrollment.payment_status !== "unpaid") {
    startButton = (
      <Link href={courseHome} className={startBtnClass} style={startBtnStyle} data-testid="start-learning">
        Start Learning
      </Link>
    );
    enrolButton = (
      <span className={enrolBtnClass + " opacity-80 cursor-default"} style={enrolBtnStyle} data-testid="enrol">
        ✓ Enrolled
      </span>
    );
  } else if (learner && enrollment) {
    startButton = (
      <Link href={checkoutHref} className={startBtnClass} style={startBtnStyle} data-testid="start-learning">
        Start Learning
      </Link>
    );
    enrolButton = (
      <Link href={checkoutHref} className={enrolBtnClass} style={enrolBtnStyle} data-testid="enrol">
        Complete Payment
      </Link>
    );
  } else if (learner) {
    startButton = enrolForm("Start Learning", startBtnStyle, startBtnClass, "start-learning");
    enrolButton = enrolForm("Enrol", enrolBtnStyle, enrolBtnClass, "enrol");
  } else {
    startButton = (
      <Link href={`/a/${slug}/login?next=${courseHome}`} className={startBtnClass} style={startBtnStyle} data-testid="start-learning">
        Start Learning
      </Link>
    );
    enrolButton = (
      <Link href={`/a/${slug}/register?next=/a/${slug}/learner/enrol/${course.id}`} className={enrolBtnClass} style={enrolBtnStyle} data-testid="enrol">
        Enrol
      </Link>
    );
  }

  const jsonLd = schemaEnabled
    ? {
        "@context": "https://schema.org",
        "@type": "Course",
        name: course.title,
        description: course.description || course.seo_meta_description || course.title,
        provider: {
          "@type": "Organization",
          name: academy.name,
          sameAs: `${process.env.APP_BASE_URL || ""}/a/${slug}`,
        },
        offers: paid
          ? { "@type": "Offer", price: (course.price_pence / 100).toFixed(2), priceCurrency: "GBP" }
          : { "@type": "Offer", price: "0", priceCurrency: "GBP" },
      }
    : null;

  return (
    <div className="min-h-screen" style={{ ...themeVars(template), background: "#f6f7fb" }}>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />}
      <header
        className="px-6 md:px-10 py-4 flex items-center justify-between"
        style={{ background: template.primary_color, color: textOnPrimary }}
      >
        <Link href={`/a/${slug}`} className="flex items-center gap-3 min-w-0">
          {logoSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoSrc} alt={`${academy.name} logo`} className="h-10 max-w-[11rem] object-contain rounded-md bg-white px-2 py-1 flex-shrink-0" />
          )}
          <span className="font-bold text-lg truncate">{academy.logo_text}</span>
        </Link>
        <Link
          href={learner ? `/a/${slug}/learner` : `/a/${slug}/login`}
          className="text-sm font-semibold px-4 py-2 rounded-md"
          style={{ background: template.accent_color, color: template.primary_color }}
        >
          {learner ? "My courses" : "Sign In"}
        </Link>
      </header>

      {/* HERO */}
      <section
        className="px-6 md:px-10 py-12 md:py-16"
        style={{ background: `linear-gradient(135deg, ${template.primary_color}, ${template.secondary_color})`, color: textOnPrimary }}
      >
        <div className="max-w-6xl mx-auto grid md:grid-cols-[1.15fr_1fr] gap-10 items-center">
          <div>
            <nav aria-label="Breadcrumb" className="text-sm mb-8 flex items-center gap-2 opacity-90">
              <Link href={`/a/${slug}`} className="font-medium hover:underline">
                Home
              </Link>
              <span aria-hidden="true" className="opacity-70">
                ›
              </span>
              <span className="opacity-80">Course</span>
            </nav>
            <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-6">{course.title}</h1>
            {course.description && <p className="text-lg md:text-xl leading-relaxed opacity-95 mb-9 whitespace-pre-line">{course.description}</p>}
            <div className="flex items-center gap-4 flex-wrap">
              {startButton}
              {enrolButton}
            </div>
          </div>
          <div>
            {course.cover_image_path ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/courses/${course.id}/cover?v=${encodeURIComponent(course.updated_at)}`}
                alt=""
                className="w-full rounded-2xl shadow-2xl object-cover aspect-[16/10]"
                data-testid="course-cover"
              />
            ) : usesDefaultEmoji(course.cover_emoji) ? (
              <div className="w-full rounded-2xl shadow-2xl aspect-[16/10] overflow-hidden" data-testid="course-art">
                <CourseArt kind={pickArt(course.title, course.category, course.description)} primary={template.primary_color} secondary={template.secondary_color} accent={template.accent_color} />
              </div>
            ) : (
              <div
                className="w-full rounded-2xl shadow-2xl aspect-[16/10] flex items-center justify-center text-8xl"
                style={{ background: "color-mix(in srgb, " + textOnPrimary + " 12%, transparent)" }}
                aria-hidden="true"
              >
                {course.cover_emoji}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* DETAILS */}
      <main className="max-w-6xl mx-auto px-6 md:px-10 py-12 grid md:grid-cols-[1.6fr_1fr] gap-8 items-start">
        <section className="app-card p-6 md:p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-1">Course content</h2>
          <p className="text-sm text-gray-500 mb-5">
            {modules.length > 0 ? `${modules.length} module${modules.length === 1 ? "" : "s"}` : "Modules will be added soon."}
          </p>
          {modules.length > 0 && (
            <ol className="grid gap-2" data-testid="course-modules">
              {modules.map((m, i) => (
                <li key={m.id} className="flex items-center gap-3 border border-gray-200 rounded-lg px-4 py-3">
                  <span className="text-xs text-gray-400 w-5">{i + 1}</span>
                  <ModuleThumb mod={m} colors={{ primary: template.primary_color, secondary: template.secondary_color, accent: template.accent_color }} className="w-20 h-[3.1rem]" />
                  <span aria-hidden="true">{ACTIVITY_ICON[m.content_type] ?? "📄"}</span>
                  <span className="text-sm font-medium text-gray-900">{m.title}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className="app-card p-6 grid gap-4 text-[15px] text-gray-900">
          <div className="flex items-center gap-3">
            <MonitorIcon />
            <span>
              <strong>Course Format</strong>: Self-Paced
            </span>
          </div>
          {course.estimated_time && (
            <div className="flex items-center gap-3">
              <ClockIcon />
              <span>
                <strong>Estimated</strong>: {course.estimated_time}
              </span>
            </div>
          )}
          <div className="border-t border-gray-200" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-bold text-lg">{paid ? "Full Course" : "Learn for Free"}</div>
              <div className="text-sm font-semibold mt-1">{paid ? "One-time purchase" : "Audit this course"}</div>
            </div>
            <div className="text-2xl font-extrabold">{paid ? formatGBP(course.price_pence) : "Free"}</div>
          </div>
          <ul className="grid gap-1.5 text-sm text-gray-800">
            <li className="flex gap-2 items-start">
              <span style={{ color: "#2f7d32" }} className="mt-0.5">
                <TickIcon />
              </span>
              Access to this course &amp; course materials
            </li>
            {!!course.certification_enabled && (
              <li className="flex gap-2 items-start">
                <span style={{ color: "#2f7d32" }} className="mt-0.5">
                  <TickIcon />
                </span>
                Certificate on completion
              </li>
            )}
          </ul>
          <div className="text-xs text-gray-500">{course.category}</div>
        </aside>
      </main>

      <footer className="px-6 md:px-10 py-8 text-center text-xs text-gray-500">
        Powered by{" "}
        <a href="https://skillsacademy.ai" className="underline">
          SkillsAcademy.ai
        </a>
      </footer>
    </div>
  );
}
