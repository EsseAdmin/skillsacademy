import { Academies, Templates } from "@/lib/queries";
import { themeVars } from "@/lib/theme";
import PortalShell from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import { createQuiz } from "@/lib/actions/quizzes";
import type { SessionPayload } from "@/lib/auth";
import type { NavItem } from "@/components/PortalShell";

export default async function QuizNewPage({
  slug,
  area,
  session,
  navItems,
  courseId,
}: {
  slug: string;
  area: "admin" | "instructor";
  session: SessionPayload;
  navItems: NavItem[];
  courseId?: string;
}) {
  const academy = (await Academies.bySlug(slug))!;
  const template = (await Templates.byId(academy.template_id))!;
  const boundCreate = createQuiz.bind(null, slug);

  return (
    <PortalShell
      brandName={academy.logo_text}
      brandTag={area === "admin" ? "Academy Admin" : "Instructor"}
      themeStyle={themeVars(template)}
      navItems={navItems}
      activeHref={`/a/${slug}/${area}/modules`}
      userName={session.name}
      userRoleLabel={area === "admin" ? "Academy Admin" : "Instructor"}
      logoutRedirect={`/a/${slug}/login`}
      trialBanner={<TrialBanner academy={academy} slug={slug} showManage={area === "admin"} />}
    >
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Build a Quiz</h1>
      <p className="text-gray-500 text-sm mb-8">
        Set up the quiz, then add questions on the next screen. Learners must meet the pass threshold to have
        this module — and, if certification is enabled on the course, the course certificate — count as complete.
      </p>

      <div className="app-card p-6 max-w-2xl">
        <form action={boundCreate} className="grid gap-4">
          {courseId && <input type="hidden" name="courseId" value={courseId} />}
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Quiz title
            <input name="title" required className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="e.g. Module 1 Knowledge Check" />
          </label>
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Description
            <textarea name="description" rows={3} className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="What does this quiz cover?" />
          </label>
          <div className="grid grid-cols-3 gap-4">
            <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
              Pass threshold (%)
              <input name="pass_threshold_pct" type="number" min="0" max="100" defaultValue={70} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
              Time limit (mins, optional)
              <input name="time_limit_minutes" type="number" min="1" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
              Max attempts (optional)
              <input name="max_attempts" type="number" min="1" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </label>
          </div>
          <div>
            <button type="submit" className="app-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold">
              Create Quiz &amp; Add Questions →
            </button>
          </div>
        </form>
      </div>
    </PortalShell>
  );
}
