import Link from "next/link";
import { Academies, Templates, Courses, Modules } from "@/lib/queries";
import { themeVars } from "@/lib/theme";
import { getT, localeFor } from "@/lib/i18n";
import CourseCard from "@/components/CourseCard";
import CourseTypeSwitches from "@/components/CourseTypeSwitches";
import { COURSE_TYPES, COURSE_TYPE_LABEL, COURSE_LEVELS, COURSE_LEVEL_LABEL, normalizeCourseType, isCourseType, parseEnabledTypes, type CourseType } from "@/lib/courseTypes";
import PortalShell from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import { createCourse } from "@/lib/actions/courses";
import type { SessionPayload } from "@/lib/auth";
import type { NavItem } from "@/components/PortalShell";

export default async function CourseListPage({
  slug,
  area,
  session,
  navItems,
  selectedType,
}: {
  slug: string;
  area: "admin" | "instructor";
  session: SessionPayload;
  navItems: NavItem[];
  // From ?type=… (the "Add" links in the course types card): pre-selects the type of the new course.
  selectedType?: string;
}) {
  const academy = (await Academies.bySlug(slug))!;
  const template = (await Templates.byId(academy.template_id))!;
  const courses = await Courses.listByAcademy(academy.id);
  const boundCreate = createCourse.bind(null, slug);
  const stats = await Modules.statsByCourses(courses.map((c) => c.id));
  const t = getT("en");
  const locale = localeFor("en");
  const counts = Object.fromEntries(COURSE_TYPES.map((ty) => [ty, courses.filter((c) => normalizeCourseType(c.course_type) === ty).length])) as Record<CourseType, number>;
  const enabled = parseEnabledTypes(academy.enabled_course_types);
  const initialType: CourseType = isCourseType(selectedType) ? selectedType : enabled[0] ?? "SELF_PACED";

  return (
    <PortalShell
      brandName={academy.logo_text}
      brandTag={area === "admin" ? "Academy Admin" : "Instructor"}
      themeStyle={themeVars(template)}
      navItems={navItems}
      activeHref={`/a/${slug}/${area}/courses`}
      userName={session.name}
      userRoleLabel={area === "admin" ? "Academy Admin" : "Instructor"}
      logoutRedirect={`/a/${slug}/login`}
      trialBanner={<TrialBanner academy={academy} slug={slug} showManage={area === "admin"} />}
    >
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Courses</h1>
          <p className="text-gray-500 text-sm mt-1">{courses.length} course{courses.length === 1 ? "" : "s"} in {academy.name}</p>
        </div>
      </div>

      <CourseTypeSwitches slug={slug} enabledTypes={academy.enabled_course_types} counts={counts} />

      <div className="app-card p-6 mb-8" id="new-course">
        <h2 className="font-semibold text-gray-900 mb-4">Create a new course</h2>
        <form action={boundCreate} className="grid md:grid-cols-2 gap-4">
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Title
            <input name="title" required className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="e.g. Health & Safety Induction" />
          </label>
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Course type
            <select name="course_type" defaultValue={initialType} className="rounded-md border border-gray-300 px-3 py-2 text-sm" data-testid="new-course-type">
              {COURSE_TYPES.map((ty) => (
                <option key={ty} value={ty}>
                  {COURSE_TYPE_LABEL[ty]}
                  {enabled.includes(ty) ? "" : " (switched off)"}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5 md:col-span-2">
            Description
            <textarea name="description" rows={2} className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="What will learners get from this course?" />
          </label>
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Level
            <select name="level" defaultValue="BEGINNER" className="rounded-md border border-gray-300 px-3 py-2 text-sm" data-testid="new-course-level">
              {COURSE_LEVELS.map((lv) => (
                <option key={lv} value={lv}>
                  {COURSE_LEVEL_LABEL[lv]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Hours of study
            <input name="study_hours" type="number" min="0" max="999" step="0.5" className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="optional, e.g. 6" />
          </label>
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Price (£, 0 = free)
            <input name="price" type="number" min="0" step="0.01" defaultValue="0" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Cover emoji
            <input name="emoji" defaultValue="📘" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <div className="md:col-span-2">
            <button type="submit" className="app-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold">
              Create Course
            </button>
          </div>
        </form>
      </div>

      {COURSE_TYPES.map((ty) => {
        const items = courses.filter((c) => normalizeCourseType(c.course_type) === ty);
        const on = enabled.includes(ty);
        return (
          <section key={ty} className="mb-10" data-testid="admin-type-section" data-course-type={ty}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900">
                {COURSE_TYPE_LABEL[ty]} <span className={`ml-2 text-[11px] px-2 py-0.5 rounded-full font-semibold ${on ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>{on ? "On" : "Off — hidden from learners"}</span>
              </h2>
              <Link href={`/a/${slug}/${area}/courses?type=${ty}#new-course`} className="text-sm app-link font-semibold">
                + Add {COURSE_TYPE_LABEL[ty].toLowerCase()}
              </Link>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((c) => (
                <CourseCard
                  key={c.id}
                  course={c}
                  template={template}
                  t={t}
                  locale={locale}
                  stats={stats[c.id]}
                  href={`/a/${slug}/${area}/courses/${c.id}`}
                  badge={
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${c.is_published ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>{c.is_published ? "Published" : "Draft"}</span>
                  }
                />
              ))}
              {items.length === 0 && <p className="text-sm text-gray-500">No courses of this type yet.</p>}
            </div>
          </section>
        );
      })}
    </PortalShell>
  );
}
