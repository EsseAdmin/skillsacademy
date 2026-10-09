"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  Quizzes,
  QuizQuestions,
  QuizOptions,
  QuizAttempts,
  Modules,
  Courses,
  Enrollments,
  ModuleCompletions,
  type QuestionType,
} from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { maybeIssueCertificate } from "@/lib/certificates";

export async function createQuiz(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const courseId = String(formData.get("courseId") || "") || null;
  const passThreshold = Number(formData.get("pass_threshold_pct") || 70);
  const timeLimit = formData.get("time_limit_minutes") ? Number(formData.get("time_limit_minutes")) : null;
  const maxAttempts = formData.get("max_attempts") ? Number(formData.get("max_attempts")) : null;
  if (!title) return;

  const mod = await Modules.create({
    academy_id: session.academyId!,
    created_by: session.userId,
    title,
    description,
    content_type: "QUIZ",
  });

  await Quizzes.create({
    academy_id: session.academyId!,
    module_id: mod.id,
    course_id: courseId,
    created_by: session.userId,
    title,
    description,
    pass_threshold_pct: passThreshold,
    time_limit_minutes: timeLimit,
    max_attempts: maxAttempts,
    shuffle_questions: false,
  });

  if (courseId) {
    const course = await Courses.byId(courseId);
    if (course && course.academy_id === session.academyId) {
      const existing = await Modules.listByCourse(courseId);
      await Modules.assignToCourse(courseId, mod.id, existing.length);
    }
  }

  const area = session.role === "ACADEMY_ADMIN" ? "admin" : "instructor";
  revalidatePath(`/a/${slug}/${area}/modules`);
  redirect(`/a/${slug}/${area}/quizzes/${mod.id}`);
}

export async function addQuestion(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const quizId = String(formData.get("quizId") || "");
  const moduleId = String(formData.get("moduleId") || "");
  const quiz = await Quizzes.byId(quizId);
  if (!quiz || quiz.academy_id !== session.academyId) return;

  const questionType = String(formData.get("question_type") || "single_choice") as QuestionType;
  const prompt = String(formData.get("prompt") || "").trim();
  const points = Number(formData.get("points") || 1);
  if (!prompt) return;

  const existingCount = (await QuizQuestions.listByQuiz(quizId)).length;

  if (questionType === "short_answer") {
    const accepted = String(formData.get("short_answer_accepted") || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    await QuizQuestions.create({
      quiz_id: quizId,
      question_type: "short_answer",
      prompt,
      points,
      order_index: existingCount,
      short_answer_accepted: accepted,
    });
  } else if (questionType === "true_false") {
    const question = await QuizQuestions.create({
      quiz_id: quizId,
      question_type: "true_false",
      prompt,
      points,
      order_index: existingCount,
    });
    const correctAnswer = String(formData.get("true_false_answer") || "true");
    await QuizOptions.create({ question_id: question.id, option_text: "True", is_correct: correctAnswer === "true", order_index: 0 });
    await QuizOptions.create({ question_id: question.id, option_text: "False", is_correct: correctAnswer === "false", order_index: 1 });
  } else {
    // single_choice | multiple_choice
    const question = await QuizQuestions.create({
      quiz_id: quizId,
      question_type: questionType,
      prompt,
      points,
      order_index: existingCount,
    });
    const optionTexts = formData.getAll("option_text").map((v) => String(v));
    const correctIndexes = new Set(formData.getAll("option_correct").map((v) => Number(v)));
    let orderIndex = 0;
    for (let i = 0; i < optionTexts.length; i++) {
      const text = optionTexts[i].trim();
      if (!text) continue;
      await QuizOptions.create({
        question_id: question.id,
        option_text: text,
        is_correct: correctIndexes.has(i),
        order_index: orderIndex++,
      });
    }
  }

  const area = session.role === "ACADEMY_ADMIN" ? "admin" : "instructor";
  revalidatePath(`/a/${slug}/${area}/quizzes/${moduleId}`);
}

export async function deleteQuestion(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const questionId = String(formData.get("questionId") || "");
  const moduleId = String(formData.get("moduleId") || "");
  const question = await QuizQuestions.byId(questionId);
  if (!question) return;
  const quiz = await Quizzes.byId(question.quiz_id);
  if (!quiz || quiz.academy_id !== session.academyId) return;
  await QuizQuestions.remove(questionId);
  const area = session.role === "ACADEMY_ADMIN" ? "admin" : "instructor";
  revalidatePath(`/a/${slug}/${area}/quizzes/${moduleId}`);
}

export async function updateQuizSettings(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const quizId = String(formData.get("quizId") || "");
  const moduleId = String(formData.get("moduleId") || "");
  const quiz = await Quizzes.byId(quizId);
  if (!quiz || quiz.academy_id !== session.academyId) return;
  await Quizzes.update(quizId, {
    pass_threshold_pct: Number(formData.get("pass_threshold_pct") || quiz.pass_threshold_pct),
    time_limit_minutes: formData.get("time_limit_minutes") ? Number(formData.get("time_limit_minutes")) : null,
    max_attempts: formData.get("max_attempts") ? Number(formData.get("max_attempts")) : null,
  });
  const area = session.role === "ACADEMY_ADMIN" ? "admin" : "instructor";
  revalidatePath(`/a/${slug}/${area}/quizzes/${moduleId}`);
}

// ---------- Learner: taking a quiz ----------

export async function submitQuizAttempt(slug: string, moduleId: string, courseId: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["LEARNER"]);
  const mod = await Modules.byId(moduleId);
  if (!mod || mod.academy_id !== session.academyId) return;
  const quiz = await Quizzes.byModule(moduleId);
  if (!quiz) return;

  const enrollment = await Enrollments.byCourseAndLearner(courseId, session.userId);
  if (!enrollment) return;

  if (quiz.max_attempts) {
    const priorAttempts = await QuizAttempts.listByQuizAndLearner(quiz.id, session.userId);
    if (priorAttempts.length >= quiz.max_attempts) {
      redirect(`/a/${slug}/learner/quiz/${moduleId}?courseId=${courseId}&error=max_attempts`);
    }
  }

  const questions = await QuizQuestions.listByQuiz(quiz.id);
  const optionsByQuestion = new Map<string, Awaited<ReturnType<typeof QuizOptions.listByQuestion>>>();
  for (const q of questions) {
    optionsByQuestion.set(q.id, await QuizOptions.listByQuestion(q.id));
  }

  let earnedPoints = 0;
  let totalPoints = 0;
  const answers: Record<string, unknown> = {};

  for (const q of questions) {
    totalPoints += q.points;
    if (q.question_type === "short_answer") {
      const answer = String(formData.get(`q_${q.id}`) || "").trim().toLowerCase();
      answers[q.id] = answer;
      const accepted: string[] = q.short_answer_accepted ? JSON.parse(q.short_answer_accepted) : [];
      if (accepted.includes(answer)) earnedPoints += q.points;
    } else if (q.question_type === "multiple_choice") {
      const selected = new Set(formData.getAll(`q_${q.id}`).map((v) => String(v)));
      answers[q.id] = Array.from(selected);
      const options = optionsByQuestion.get(q.id) || [];
      const correctIds = new Set(options.filter((o) => o.is_correct).map((o) => o.id));
      const isExactMatch = selected.size === correctIds.size && Array.from(selected).every((id) => correctIds.has(id));
      if (isExactMatch) earnedPoints += q.points;
    } else {
      // single_choice | true_false
      const selected = String(formData.get(`q_${q.id}`) || "");
      answers[q.id] = selected;
      const options = optionsByQuestion.get(q.id) || [];
      const correct = options.find((o) => o.is_correct);
      if (correct && correct.id === selected) earnedPoints += q.points;
    }
  }

  const scorePct = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
  const passed = scorePct >= quiz.pass_threshold_pct;

  const attempt = await QuizAttempts.start({ quiz_id: quiz.id, learner_id: session.userId, enrollment_id: enrollment.id });
  await QuizAttempts.submit(attempt.id, { score_pct: scorePct, passed, answers_json: JSON.stringify(answers) });

  if (passed) {
    await ModuleCompletions.complete(enrollment.id, moduleId);
    const total = (await Modules.listByCourse(courseId)).length;
    const done = (await ModuleCompletions.listByEnrollment(enrollment.id)).length;
    await Enrollments.setProgress(enrollment.id, total > 0 ? Math.round((done / total) * 100) : 0);
    await maybeIssueCertificate(courseId, session.userId);
  }

  revalidatePath(`/a/${slug}/learner/courses/${courseId}`);
  redirect(`/a/${slug}/learner/quiz/${moduleId}?courseId=${courseId}&result=${attempt.id}`);
}
