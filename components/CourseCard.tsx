import Link from "next/link";
import type { ReactNode } from "react";
import type { Course, Template } from "@/lib/queries";
import type { TFunction } from "@/lib/i18n";
import CourseImage from "@/components/CourseImage";
import { CourseTypeIcon } from "@/components/courseIcons";
import { normalizeCourseType, normalizeLevel, courseStudyHours, formatHoursNumber } from "@/lib/courseTypes";
import { formatGBP } from "@/lib/utils";
import { linkColorOnWhite } from "@/lib/color";

// A course (or learning journey) as one card: picture with a price pill, the
// course type, title, description and a line saying the level, how many
// modules it has and how many hours it takes. Used on the public academy
// page, in the learner catalogue and in the admin / instructor lists.
export default function CourseCard({
  course,
  template,
  href,
  t,
  locale,
  stats,
  badge,
  footer,
}: {
  course: Course;
  template: Pick<Template, "primary_color" | "secondary_color" | "accent_color">;
  href: string;
  t: TFunction;
  locale: string;
  stats?: { count: number; minutes: number };
  // Extra small label on the picture (e.g. "Draft" for staff).
  badge?: ReactNode;
  footer?: ReactNode;
}) {
  const type = normalizeCourseType(course.course_type);
  const level = normalizeLevel(course.level);
  const hours = courseStudyHours(course.study_hours, stats?.minutes ?? 0);
  const modules = stats?.count ?? 0;
  const paid = course.price_pence > 0;
  const kicker = linkColorOnWhite(template.primary_color);
  const meta = [
    t(`level_${level.toLowerCase()}` as "level_beginner"),
    t("site_count_modules", { n: modules }),
    ...(hours > 0 ? [t("card_hours", { n: formatHoursNumber(hours) })] : []),
  ];
  return (
    <div className="app-card overflow-hidden flex flex-col relative group" data-testid="course-card" data-course-type={type}>
      <div className="relative aspect-[16/9] overflow-hidden">
        <CourseImage course={course} template={template} />
        <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-gray-900 shadow-sm" data-testid="course-price">
          {paid ? formatGBP(course.price_pence, locale) : t("site_free")}
        </span>
        {badge && <span className="absolute right-3 top-3">{badge}</span>}
      </div>
      <div className="p-5 flex flex-col gap-2 flex-1">
        <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.14em] uppercase" style={{ color: kicker }} data-testid="course-type-kicker">
          <CourseTypeIcon type={type} size={14} />
          {t(`type_${type.toLowerCase()}` as "type_self_paced")}
        </div>
        <Link href={href} className="font-bold text-lg leading-snug text-gray-900 after:absolute after:inset-0 hover:underline" aria-label={t("site_course_details_aria", { title: course.title })}>
          {course.title}
        </Link>
        <p className="text-sm text-gray-600 line-clamp-3">{course.description || t("site_no_description")}</p>
        <div className="mt-auto pt-3 text-sm text-gray-700 font-medium" data-testid="course-meta">
          {meta.join(" • ")}
        </div>
      </div>
      {footer && <div className="relative z-10 px-5 pb-5">{footer}</div>}
    </div>
  );
}
