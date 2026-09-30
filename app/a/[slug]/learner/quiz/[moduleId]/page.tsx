import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Academies, Templates, Courses, Modules, Enrollments, Quizzes, QuizQuestions, QuizOptions, QuizAttempts } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { themeVars } from "@/lib/theme";
import PortalShell from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import { LEARNER_NAV } from "@/lib/nav";
import { submitQuizAttempt } from "@/lib/actions/quizzes";

export default async function LearnerQuizPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; moduleId: string }>;
  searchParams: Promise<{ courseId?: string; result?: string; error?: string }>;
}) {
  const { slug, moduleId } = await params;
  const { courseId, result, error } = await searchParams;
  const session = await requireTenantSession(slug, ["LEARNER"]);
  const academy = await Academies.bySlug(slug);
  if (!academy) notFound();
  const template = (await Templates.byId(academy.template_id))!;

  const mod = await Modules.byId(moduleId);
  if (!mod || mod.academy_id !== academy.id || mod.content_type !== "QUIZ") notFound();
  const quiz = await Quizzes.byModule(moduleId);
  if (!quiz) notFound();

  if (!courseId) notFound();
  const course = await Courses.byId(courseId);
  if (!course || course.academy_id !== academy.id) notFound();

  const enrollment = await Enrollments.byCourseAndLearner(courseId, session.userId);
  if (!enrollment || enrollment.payment_status === "unpaid") {
    redirect(`/a/${slug}/learner/courses/${courseId}`);
  }

  const attempts = await QuizAttempts.listByQuizAndLearner(quiz.id, session.userId);
  const resultAttempt = result ? attempts.find((a) => a.id === result) : undefined;
  const atMaxAttempts = quiz.max_attempts != null && attempts.length >= quiz.max_attempts;

  const questions = await QuizQuestions.listByQuiz(quiz.id);
  const questionsWithOptions = await Promise.all(
    questions.map(async (q) => ({ ...q, options: await QuizOptions.listByQuestion(q.id) }))
  );

  const boundSubmit = submitQuizAttempt.bind(null, slug, moduleId, courseId);

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
      <Link href={`/a/${slug}/learner/courses/${courseId}`} className="text-sm app-link mb-4 inline-block">
        ← Back to course
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">🧪 {quiz.title}</h1>
      <p className="text-gray-500 text-sm mb-6">{quiz.description}</p>

      {error === "max_attempts" && (
        <div className="mb-6 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-5 py-4 text-sm">
          You&apos;ve used all {quiz.max_attempts} allowed attempt{quiz.max_attempts !== 1 ? "s" : ""} for this quiz.
        </div>
      )}

      {resultAttempt && (
        <div
          className={`mb-6 rounded-lg border px-5 py-4 text-sm ${
            resultAttempt.passed
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          {resultAttempt.passed ? "✅ Passed" : "❌ Not passed"} — scored {resultAttempt.score_pct}% (needed{" "}
          {quiz.pass_threshold_pct}%).
        </div>
      )}

      {attempts.length > 0 && (
        <div className="app-card p-4 mb-6 text-xs text-gray-500">
          Previous attempts: {attempts.map((a) => `${a.score_pct ?? "—"}%`).join(", ")}
          {quiz.max_attempts && ` (${attempts.length}/${quiz.max_attempts} used)`}
        </div>
      )}

      {atMaxAttempts ? (
        <p className="text-sm text-gray-500">No attempts remaining.</p>
      ) : (
        <form action={boundSubmit} className="space-y-6">
          {questionsWithOptions.map((q, i) => (
            <div key={q.id} className="app-card p-5">
              <div className="text-sm font-medium text-gray-900 mb-3">
                {i + 1}. {q.prompt} <span className="text-xs text-gray-400 font-normal">({q.points} pt{q.points !== 1 ? "s" : ""})</span>
              </div>
              {q.question_type === "single_choice" || q.question_type === "true_false" ? (
                <div className="grid gap-2">
                  {q.options.map((o) => (
                    <label key={o.id} className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="radio" name={`q_${q.id}`} value={o.id} required />
                      {o.option_text}
                    </label>
                  ))}
                </div>
              ) : q.question_type === "multiple_choice" ? (
                <div className="grid gap-2">
                  {q.options.map((o) => (
                    <label key={o.id} className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="checkbox" name={`q_${q.id}`} value={o.id} />
                      {o.option_text}
                    </label>
                  ))}
                </div>
              ) : (
                <input name={`q_${q.id}`} className="rounded-md border border-gray-300 px-3 py-2 text-sm w-full" placeholder="Your answer" />
              )}
            </div>
          ))}
          {questionsWithOptions.length === 0 && <p className="text-sm text-gray-500">This quiz has no questions yet.</p>}
          {questionsWithOptions.length > 0 && (
            <button type="submit" className="app-btn-primary rounded-md px-6 py-3 text-sm font-semibold">
              Submit Quiz
            </button>
          )}
        </form>
      )}
    </PortalShell>
  );
}
