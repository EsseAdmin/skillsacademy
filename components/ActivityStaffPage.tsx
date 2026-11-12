import Link from "next/link";
import { notFound } from "next/navigation";
import { Academies, Templates } from "@/lib/queries";
import { themeVars } from "@/lib/theme";
import PortalShell, { type NavItem } from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import ForumThread from "@/components/ForumThread";
import { staffModule } from "@/lib/moduleAccess";
import { ChoiceResponses, ForumPosts, Submissions } from "@/lib/activityQueries";
import { ACTIVITY_ICON, ACTIVITY_LABEL, readAssignment, readChoice, readForum, tallyVotes } from "@/lib/activities";
import { gradeSubmission, reopenSubmission, moderateForumPost, staffReplyForum } from "@/lib/actions/activities";
import type { SessionPayload } from "@/lib/auth";

const field = "rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900";
const fmt = (iso: string) => new Date(iso).toISOString().replace("T", " ").slice(0, 16) + " UTC";

// Staff view of an activity: grade assignment hand-ins, moderate a forum, see poll results.
export default async function ActivityStaffPage({
  slug, area, session, navItems, moduleId, graded, error,
}: {
  slug: string;
  area: "admin" | "instructor";
  session: SessionPayload;
  navItems: NavItem[];
  moduleId: string;
  graded?: string;
  error?: string;
}) {
  const mod = await staffModule(session, moduleId); // only modules in this academy that this person manages
  if (!mod) notFound();
  const academy = (await Academies.bySlug(slug))!;
  const template = (await Templates.byId(academy.template_id))!;

  let body: React.ReactNode = <p className="text-sm text-gray-700">There&apos;s nothing to review for this type of module.</p>;

  if (mod.content_type === "ASSIGNMENT") {
    const cfg = readAssignment(mod.config_json);
    const subs = await Submissions.listByModule(mod.id);
    body = (
      <div className="grid gap-4">
        <div className="rounded-lg border border-gray-200 bg-white p-5 text-sm text-gray-800">
          <div className="mb-1 font-semibold text-gray-900">Instructions</div>
          <p className="whitespace-pre-line">{mod.content_text}</p>
          <p className="mt-2 text-xs text-gray-700">Maximum grade {cfg.maxGrade}{cfg.dueAt ? ` · Due ${fmt(cfg.dueAt)}` : ""}</p>
        </div>
        {subs.length === 0 && <p className="text-sm text-gray-700">No hand-ins yet.</p>}
        {subs.map((s) => (
          <section key={s.id} className="rounded-lg border border-gray-200 bg-white p-5" aria-label={`Hand-in from ${s.learner_name}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><span className="font-semibold text-gray-900">{s.learner_name}</span> <span className="text-xs text-gray-600">{s.learner_email}</span></div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s.status === "GRADED" ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>{s.status === "GRADED" ? `Graded ${s.grade}/${cfg.maxGrade}` : "Needs grading"}</span>
            </div>
            <p className="mt-1 text-xs text-gray-700">Submitted {fmt(s.submitted_at)}{cfg.dueAt && new Date(s.submitted_at) > new Date(cfg.dueAt) ? " · late" : ""}</p>
            {s.submission_text && <p className="mt-3 whitespace-pre-line rounded-md bg-gray-50 p-3 text-sm text-gray-800">{s.submission_text}</p>}
            {s.file_name && <p className="mt-2 text-sm"><a href={`/api/submissions/${s.id}`} className="app-link">📥 {s.file_name}</a></p>}
            <form action={gradeSubmission.bind(null, slug)} className="mt-4 grid gap-2 sm:grid-cols-[110px_1fr_auto] sm:items-start">
              <input type="hidden" name="moduleId" value={mod.id} />
              <input type="hidden" name="submissionId" value={s.id} />
              <label className="grid gap-1 text-xs font-semibold text-gray-700">Grade (0–{cfg.maxGrade})
                <input name="grade" type="number" min={0} max={cfg.maxGrade} required defaultValue={s.grade ?? ""} className={field} />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-gray-700">Feedback
                <textarea name="feedback" rows={2} defaultValue={s.feedback ?? ""} className={field} />
              </label>
              <button type="submit" className="app-btn-primary rounded-md px-4 py-2 text-xs font-semibold sm:mt-5">{s.status === "GRADED" ? "Update grade" : "Save grade"}</button>
            </form>
            {s.status === "GRADED" && (
              <form action={reopenSubmission.bind(null, slug)} className="mt-2">
                <input type="hidden" name="moduleId" value={mod.id} />
                <input type="hidden" name="submissionId" value={s.id} />
                <button type="submit" className="text-xs font-semibold text-gray-700 underline">Let this learner resubmit (clears the grade)</button>
              </form>
            )}
          </section>
        ))}
      </div>
    );
  }

  if (mod.content_type === "CHOICE") {
    const cfg = readChoice(mod.config_json);
    const counts = tallyVotes(cfg.options.length, await ChoiceResponses.listByModule(mod.id));
    const total = counts.reduce((a, b) => a + b, 0);
    body = (
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 font-semibold text-gray-900">{cfg.question}</h2>
        <ul className="grid gap-3">
          {cfg.options.map((o, i) => (
            <li key={i} className="text-sm text-gray-900">
              <div className="mb-1 flex justify-between"><span>{o}</span><span>{counts[i]} · {total ? Math.round((counts[i] / total) * 100) : 0}%</span></div>
              <div className="h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full app-btn-accent" style={{ width: `${total ? (counts[i] / total) * 100 : 0}%` }} /></div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-gray-700">{total} {total === 1 ? "response" : "responses"}</p>
      </div>
    );
  }

  if (mod.content_type === "FORUM") {
    const cfg = readForum(mod.config_json);
    const posts = await ForumPosts.listByModule(mod.id);
    body = (
      <div className="grid gap-4">
        {cfg.prompt && <p className="whitespace-pre-line rounded-lg border border-gray-200 bg-white p-5 text-sm text-gray-800">{cfg.prompt}</p>}
        <ForumThread moduleId={mod.id} posts={posts} postAction={staffReplyForum.bind(null, slug)} moderateAction={moderateForumPost.bind(null, slug)} />
      </div>
    );
  }

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
      <Link href={`/a/${slug}/${area}/modules`} className="text-sm app-link mb-4 inline-block">← Module library</Link>
      <h1 className="mb-1 text-2xl font-bold text-gray-900">{ACTIVITY_ICON[mod.content_type]} {mod.title}</h1>
      <p className="mb-6 text-sm text-gray-700">{ACTIVITY_LABEL[mod.content_type]}{mod.description ? ` — ${mod.description}` : ""}</p>
      {graded && <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-800">✅ Grade saved.</div>}
      {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-800">{error}</div>}
      {body}
    </PortalShell>
  );
}
