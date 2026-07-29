import { notFound } from "next/navigation";
import { Academies, Templates, Modules, Quizzes, QuizQuestions, QuizOptions } from "@/lib/queries";
import { themeVars } from "@/lib/theme";
import PortalShell from "@/components/PortalShell";
import TrialBanner from "@/components/TrialBanner";
import QuestionForm from "@/components/QuestionForm";
import { addQuestion, deleteQuestion, updateQuizSettings } from "@/lib/actions/quizzes";
import type { SessionPayload } from "@/lib/auth";
import type { NavItem } from "@/components/PortalShell";

const TYPE_LABEL: Record<string, string> = {
  single_choice: "Single choice",
  multiple_choice: "Multiple choice",
  true_false: "True / False",
  short_answer: "Short answer",
};

export default async function QuizBuilderPage({
  slug,
  area,
  session,
  navItems,
  moduleId,
}: {
  slug: string;
  area: "admin" | "instructor";
  session: SessionPayload;
  navItems: NavItem[];
  moduleId: string;
}) {
  const academy = (await Academies.bySlug(slug))!;
  const template = (await Templates.byId(academy.template_id))!;
  const mod = await Modules.byId(moduleId);
  if (!mod || mod.academy_id !== academy.id || mod.content_type !== "QUIZ") notFound();
  const quiz = await Quizzes.byModule(moduleId);
  if (!quiz) notFound();

  const questions = await QuizQuestions.listByQuiz(quiz.id);
  const questionsWithOptions = await Promise.all(
    questions.map(async (q) => ({ ...q, options: await QuizOptions.listByQuestion(q.id) }))
  );

  const boundAddQuestion = addQuestion.bind(null, slug);
  const boundDeleteQuestion = deleteQuestion.bind(null, slug);
  const boundUpdateSettings = updateQuizSettings.bind(null, slug);

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
      <h1 className="text-2xl font-bold text-gray-900 mb-1">🧪 {quiz.title}</h1>
      <p className="text-gray-500 text-sm mb-8">{quiz.description || "Add questions below."}</p>

      <div className="app-card p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Quiz settings</h2>
        <form action={boundUpdateSettings} className="flex flex-wrap gap-4 items-end">
          <input type="hidden" name="quizId" value={quiz.id} />
          <input type="hidden" name="moduleId" value={moduleId} />
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Pass threshold (%)
            <input name="pass_threshold_pct" type="number" min="0" max="100" defaultValue={quiz.pass_threshold_pct} className="rounded-md border border-gray-300 px-3 py-2 text-sm w-28" />
          </label>
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Time limit (mins)
            <input name="time_limit_minutes" type="number" min="1" defaultValue={quiz.time_limit_minutes ?? ""} className="rounded-md border border-gray-300 px-3 py-2 text-sm w-28" />
          </label>
          <label className="text-xs font-semibold text-gray-600 grid gap-1.5">
            Max attempts
            <input name="max_attempts" type="number" min="1" defaultValue={quiz.max_attempts ?? ""} className="rounded-md border border-gray-300 px-3 py-2 text-sm w-28" />
          </label>
          <button type="submit" className="rounded-md px-4 py-2 text-sm font-semibold border border-gray-300 hover:bg-gray-50">
            Save
          </button>
        </form>
      </div>

      <div className="app-card p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Questions ({questionsWithOptions.length})</h2>
        <div className="space-y-3 mb-6">
          {questionsWithOptions.map((q, i) => (
            <div key={q.id} className="border border-gray-200 rounded-md px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    {i + 1}. {q.prompt}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {TYPE_LABEL[q.question_type]} · {q.points} pt{q.points !== 1 ? "s" : ""}
                  </div>
                  {(q.question_type === "single_choice" || q.question_type === "multiple_choice" || q.question_type === "true_false") && (
                    <ul className="text-xs text-gray-500 mt-2 space-y-0.5">
                      {q.options.map((o) => (
                        <li key={o.id}>
                          {o.is_correct ? "✅" : "▫️"} {o.option_text}
                        </li>
                      ))}
                    </ul>
                  )}
                  {q.question_type === "short_answer" && q.short_answer_accepted && (
                    <div className="text-xs text-gray-500 mt-2">Accepted: {JSON.parse(q.short_answer_accepted).join(", ")}</div>
                  )}
                </div>
                <form action={boundDeleteQuestion}>
                  <input type="hidden" name="questionId" value={q.id} />
                  <input type="hidden" name="moduleId" value={moduleId} />
                  <button type="submit" className="text-xs text-gray-400 hover:text-red-600 whitespace-nowrap">
                    Delete
                  </button>
                </form>
              </div>
            </div>
          ))}
          {questionsWithOptions.length === 0 && <p className="text-sm text-gray-500">No questions yet — add one below.</p>}
        </div>

        <div className="border-t border-gray-100 pt-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Add a question</h3>
          <QuestionForm action={boundAddQuestion} quizId={quiz.id} moduleId={moduleId} />
        </div>
      </div>
    </PortalShell>
  );
}
