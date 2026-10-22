import { notFound } from "next/navigation";
import Link from "next/link";
import { Academies, Templates, ModuleCompletions, Enrollments } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { learnerModule } from "@/lib/moduleAccess";
import { themeVars } from "@/lib/theme";
import PortalShell from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import { LEARNER_NAV } from "@/lib/nav";
import { ACTIVITY_ICON, ACTIVITY_LABEL, ACTIVITY_PAGE_TYPES, lessonForLearner, readAssignment, readBook, readChoice, readForum, readGlossary, readLesson, tallyVotes } from "@/lib/activities";
import { ChoiceResponses, ForumPosts, Submissions } from "@/lib/activityQueries";
import { lessonAnswered } from "@/lib/activityLogic";
import { submitAssignmentAction, submitChoiceAction, postForumAction } from "@/lib/actions/activityLearner";
import { markModuleComplete } from "@/lib/actions/learning";
import BookReader from "@/components/BookReader";
import GlossaryView from "@/components/GlossaryView";
import LessonPlayer from "@/components/LessonPlayer";
import ForumThread from "@/components/ForumThread";
import { DOCUMENT_ACCEPT } from "@/lib/uploads-shared";

const field = "rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900";

export default async function LearnerActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; moduleId: string }>;
  searchParams: Promise<{ courseId?: string; done?: string; error?: string }>;
}) {
  const { slug, moduleId } = await params;
  const { done, error } = await searchParams;
  const session = await requireTenantSession(slug, ["LEARNER"]);
  const found = await learnerModule(session, moduleId);
  if (!found || !ACTIVITY_PAGE_TYPES.includes(found.mod.content_type)) notFound();
  const { mod, courseId } = found;
  const academy = (await Academies.bySlug(slug))!;
  const template = (await Templates.byId(academy.template_id))!;
  const enrollment = (await Enrollments.byCourseAndLearner(courseId, session.userId))!;
  const complete = (await ModuleCompletions.listByEnrollment(enrollment.id)).includes(mod.id);
  const manual = mod.content_type === "BOOK" || mod.content_type === "GLOSSARY";

  let body: React.ReactNode = null;
  if (mod.content_type === "BOOK") body = <BookReader chapters={readBook(mod.config_json)} />;
  if (mod.content_type === "GLOSSARY") body = <GlossaryView terms={readGlossary(mod.config_json)} />;
  if (mod.content_type === "LESSON") {
    body = <LessonPlayer slug={slug} moduleId={mod.id} pages={lessonForLearner(readLesson(mod.config_json))} answered={await lessonAnswered(mod.id, session.userId)} alreadyDone={complete} />;
  }

  if (mod.content_type === "ASSIGNMENT") {
    const cfg = readAssignment(mod.config_json);
    const sub = await Submissions.byModuleAndLearner(mod.id, session.userId);
    const graded = sub?.status === "GRADED";
    body = (
      <div className="grid gap-5">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-2 font-semibold text-gray-900">Instructions</h2>
          <p className="whitespace-pre-line text-sm text-gray-800">{mod.content_text}</p>
          <p className="mt-3 text-xs text-gray-700">
            Maximum grade: {cfg.maxGrade}
            {cfg.dueAt && <> · Due {new Date(cfg.dueAt).toISOString().replace("T", " ").slice(0, 16)} UTC</>}
          </p>
        </div>
        {sub && (
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="mb-2 font-semibold text-gray-900">Your hand-in</h2>
            <p className="text-xs text-gray-700 mb-2">
              Submitted {new Date(sub.submitted_at).toISOString().replace("T", " ").slice(0, 16)} UTC
              {cfg.dueAt && new Date(sub.submitted_at) > new Date(cfg.dueAt) && " · late"}
            </p>
            {sub.submission_text && <p className="whitespace-pre-line rounded-md bg-gray-50 p-3 text-sm text-gray-800">{sub.submission_text}</p>}
            {sub.file_name && <p className="mt-2 text-sm"><a href={`/api/submissions/${sub.id}`} className="app-link">📥 {sub.file_name}</a></p>}
            {graded ? (
              <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <div className="font-semibold">Grade: {sub.grade} / {cfg.maxGrade}</div>
                {sub.feedback && <p className="mt-1 whitespace-pre-line">{sub.feedback}</p>}
              </div>
            ) : (
              <p className="mt-3 text-sm text-gray-700">Waiting to be graded. You can replace your hand-in below until it is.</p>
            )}
          </div>
        )}
        {!graded && (
          <form action={submitAssignmentAction.bind(null, slug)} className="grid gap-3 rounded-lg border border-gray-200 bg-white p-5">
            <input type="hidden" name="moduleId" value={mod.id} />
            <h2 className="font-semibold text-gray-900">{sub ? "Replace your hand-in" : "Hand in your work"}</h2>
            {cfg.allowText && <textarea name="submission_text" rows={8} defaultValue={sub?.submission_text ?? ""} placeholder="Write your answer…" aria-label="Your answer" className={field} />}
            {cfg.allowFile && (
              <label className="grid gap-1 text-xs font-semibold text-gray-700">
                Attach a file (up to 5MB){sub?.file_name ? ` — current: ${sub.file_name}` : ""}
                <input name="file" type="file" accept={DOCUMENT_ACCEPT} className={`${field} file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs`} />
              </label>
            )}
            <div><button type="submit" className="app-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold">{sub ? "Resubmit" : "Submit"}</button></div>
          </form>
        )}
      </div>
    );
  }

  if (mod.content_type === "CHOICE") {
    const cfg = readChoice(mod.config_json);
    const mine = await ChoiceResponses.byModuleAndLearner(mod.id, session.userId);
    const counts = tallyVotes(cfg.options.length, await ChoiceResponses.listByModule(mod.id));
    const total = counts.reduce((a, b) => a + b, 0);
    body = (
      <div className="grid gap-5">
        {(mine === null || cfg.allowChange) && (
          <form action={submitChoiceAction.bind(null, slug)} className="grid gap-3 rounded-lg border border-gray-200 bg-white p-5">
            <input type="hidden" name="moduleId" value={mod.id} />
            <fieldset>
              <legend className="mb-3 font-semibold text-gray-900">{cfg.question}</legend>
              <div className="grid gap-2">
                {cfg.options.map((o, i) => (
                  <label key={i} className="flex items-center gap-2 text-sm text-gray-900">
                    <input type="radio" name="option" value={i} defaultChecked={mine === i} required /> {o}
                  </label>
                ))}
              </div>
            </fieldset>
            <div><button type="submit" className="app-btn-primary rounded-md px-5 py-2 text-sm font-semibold">{mine === null ? "Save my choice" : "Change my choice"}</button></div>
          </form>
        )}
        {mine !== null && cfg.allowChange === false && <p className="text-sm text-gray-800">You answered: <strong>{cfg.options[mine]}</strong></p>}
        {mine !== null && cfg.showResults && (
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-gray-900">Results ({total} {total === 1 ? "vote" : "votes"})</h2>
            <ul className="grid gap-3">
              {cfg.options.map((o, i) => (
                <li key={i} className="text-sm text-gray-900">
                  <div className="mb-1 flex justify-between"><span>{o}{mine === i ? " (your choice)" : ""}</span><span>{counts[i]} · {total ? Math.round((counts[i] / total) * 100) : 0}%</span></div>
                  <div className="h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full app-btn-accent" style={{ width: `${total ? (counts[i] / total) * 100 : 0}%` }} /></div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  if (mod.content_type === "FORUM") {
    const cfg = readForum(mod.config_json);
    const posts = await ForumPosts.listByModule(mod.id);
    body = (
      <div className="grid gap-4">
        {cfg.prompt && <p className="whitespace-pre-line rounded-lg border border-gray-200 bg-white p-5 text-sm text-gray-800">{cfg.prompt}</p>}
        <ForumThread moduleId={mod.id} posts={posts} postAction={postForumAction.bind(null, slug)} />
      </div>
    );
  }

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
      <Link href={`/a/${slug}/learner/courses/${courseId}`} className="text-sm app-link mb-4 inline-block">← Back to the course</Link>
      <h1 className="mb-1 text-2xl font-bold text-gray-900">{ACTIVITY_ICON[mod.content_type]} {mod.title}</h1>
      <p className="mb-1 text-sm text-gray-700">{mod.description || ACTIVITY_LABEL[mod.content_type]}</p>
      {complete && <p className="mb-4 text-sm font-semibold text-emerald-700">✓ Complete</p>}
      {done && <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-800">{done === "late" ? "Handed in — it was after the due date, so it's marked late." : "✅ Saved."}</div>}
      {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-800">{error}</div>}
      <div className="mt-4">{body}</div>
      {manual && !complete && (
        <form action={markModuleComplete.bind(null, slug)} className="mt-6">
          <input type="hidden" name="courseId" value={courseId} />
          <input type="hidden" name="moduleId" value={mod.id} />
          <button type="submit" className="app-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold">Mark complete</button>
        </form>
      )}
    </PortalShell>
  );
}
