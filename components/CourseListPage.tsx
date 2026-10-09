import Link from "next/link";
import { Academies, Templates, Courses } from "@/lib/queries";
import { themeVars } from "@/lib/theme";
import { formatGBP } from "@/lib/utils";
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
}: {
  slug: string;
  area: "admin" | "instructor";
  session: SessionPayload;
  navItems: NavItem[];
}) {
  const academy = (await Academies.bySlug(slug))!;
  const template = (await Templates.byId(academy.template_id))!;
  const courses = await Courses.listByAcademy(academy.id);
  const boundCreate = createCourse.bind(null, slug);

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

      <div className="app-card p-6 mb-8">
        <h2 className="font-semibold text-gray-900 mb-4">Create a new course</h2>
        <form action={boundCreate} className="grid md:grid-cols-2 gap-4">
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Title
            <input name="title" required className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="e.g. Health & Safety Induction" />
          </label>
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Category
            <input name="category" className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="e.g. Compliance" />
          </label>
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5 md:col-span-2">
            Description
            <textarea name="description" rows={2} className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="What will learners get from this course?" />
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

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {courses.map((c) => (
          <Link key={c.id} href={`/a/${slug}/${area}/courses/${c.id}`} className="app-card p-5 hover:shadow-md transition block">
            <div className="text-3xl mb-3">{c.cover_emoji}</div>
            <div className="font-semibold text-gray-900 mb-1">{c.title}</div>
            <div className="text-xs text-gray-500 mb-3">{c.category}</div>
            <p className="text-sm text-gray-600 line-clamp-2 mb-4">{c.description || "No description yet."}</p>
            <div className="flex items-center justify-between text-xs">
              <span className={`px-2 py-1 rounded-full font-semibold ${c.is_published ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                {c.is_published ? "Published" : "Draft"}
              </span>
              <span className="font-semibold text-gray-900">{c.price_pence > 0 ? formatGBP(c.price_pence) : "Free"}</span>
            </div>
          </Link>
        ))}
        {courses.length === 0 && <p className="text-sm text-gray-500">No courses yet — create your first one above.</p>}
      </div>
    </PortalShell>
  );
}
