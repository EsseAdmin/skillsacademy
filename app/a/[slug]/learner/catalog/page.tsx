import { notFound } from "next/navigation";
import { Academies, Templates, Courses, Enrollments } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { themeVars } from "@/lib/theme";
import { formatGBP } from "@/lib/utils";
import PortalShell from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import { LEARNER_NAV } from "@/lib/nav";
import { enrollFree } from "@/lib/actions/learning";
import Link from "next/link";

export default async function CatalogPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await requireTenantSession(slug, ["LEARNER"]);
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const template = (await Templates.byId(academy.template_id))!;

  const courses = await Courses.listByAcademy(academy.id, true);
  const myEnrollments = new Map((await Enrollments.listByLearner(session.userId)).map((e) => [e.course_id, e]));
  const boundEnroll = enrollFree.bind(null, slug);

  return (
    <PortalShell
      brandName={academy.logo_text}
      brandTag="Learner"
      themeStyle={themeVars(template)}
      navItems={LEARNER_NAV(slug)}
      activeHref={`/a/${slug}/learner/catalog`}
      userName={session.name}
      userRoleLabel="Learner"
      logoutRedirect={`/a/${slug}/login`}
      trialBanner={<TrialBanner academy={academy} slug={slug} showManage={false} />}
    >
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Course Catalog</h1>
      <p className="text-gray-500 text-sm mb-8">{courses.length} courses available at {academy.name}.</p>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {courses.map((c) => {
          const enrollment = myEnrollments.get(c.id);
          return (
            <div key={c.id} className="app-card p-5 flex flex-col">
              <div className="text-3xl mb-3">{c.cover_emoji}</div>
              <div className="font-semibold text-gray-900 mb-1">{c.title}</div>
              <div className="text-xs text-gray-500 mb-3">{c.category}</div>
              <p className="text-sm text-gray-600 flex-1 mb-4">{c.description}</p>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-900">{c.price_pence > 0 ? formatGBP(c.price_pence) : "Free"}</span>
                {enrollment ? (
                  <Link href={`/a/${slug}/learner/courses/${c.id}`} className="app-btn-primary rounded-md px-4 py-2 text-xs font-semibold">
                    {enrollment.payment_status === "unpaid" ? "Complete Payment" : "Go to Course"}
                  </Link>
                ) : c.price_pence > 0 ? (
                  <Link href={`/a/${slug}/learner/checkout/${c.id}`} className="app-btn-accent rounded-md px-4 py-2 text-xs">
                    Buy Now
                  </Link>
                ) : (
                  <form action={boundEnroll}>
                    <input type="hidden" name="courseId" value={c.id} />
                    <button type="submit" className="app-btn-primary rounded-md px-4 py-2 text-xs font-semibold">
                      Enrol Free
                    </button>
                  </form>
                )}
              </div>
            </div>
          );
        })}
        {courses.length === 0 && <p className="text-sm text-gray-500">No published courses yet.</p>}
      </div>
    </PortalShell>
  );
}
