import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Academies, Templates, Courses, Plans } from "@/lib/queries";
import { themeVars } from "@/lib/theme";
import { formatGBP } from "@/lib/utils";
import { hasSeoTier } from "@/lib/seoTiers";

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
        offers:
          course.price_pence > 0
            ? { "@type": "Offer", price: (course.price_pence / 100).toFixed(2), priceCurrency: "GBP" }
            : { "@type": "Offer", price: "0", priceCurrency: "GBP" },
      }
    : null;

  return (
    <div className="min-h-screen bg-white" style={themeVars(template)}>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />}
      <header
        className="px-6 md:px-10 py-6 flex items-center justify-between"
        style={{ background: template.primary_color, color: "#fff" }}
      >
        <Link href={`/a/${slug}`} className="font-bold">
          {academy.logo_text}
        </Link>
        <Link
          href={`/a/${slug}/login`}
          className="text-sm font-semibold px-4 py-2 rounded-md"
          style={{ background: template.accent_color, color: template.primary_color }}
        >
          Sign In
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-6 md:px-10 py-14">
        <div className="text-5xl mb-4">{course.cover_emoji}</div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{course.title}</h1>
        <p className="text-sm text-gray-500 mb-6">{course.category}</p>
        <p className="text-gray-700 leading-relaxed whitespace-pre-line mb-8">{course.description}</p>

        <div className="app-card p-6 flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500">Price</div>
            <div className="text-2xl font-bold text-gray-900">{course.price_pence > 0 ? formatGBP(course.price_pence) : "Free"}</div>
          </div>
          <Link
            href={`/a/${slug}/login`}
            className="rounded-md px-6 py-3 text-sm font-semibold"
            style={{ background: template.primary_color, color: "#fff" }}
          >
            Sign in to enrol →
          </Link>
        </div>
      </main>
    </div>
  );
}
