/**
 * quiz controller
 */

import { factories } from '@strapi/strapi';
import type { Context } from 'koa';
import { isStudent } from '../../../utils/roles';
import {
  QUIZ_PASS_SCORE,
  isEnrolled,
  resolveQuizCourse,
  upsertOne,
} from '../../../utils/lms';

type Question = {
  questionText?: string;
  options?: unknown;
  correctOptionIndex?: number | null;
};

export default factories.createCoreController('api::quiz.quiz', () => ({
  /**
   * POST /api/quizzes/:documentId/submit
   *
   * Grades entirely on the server. The client sends only chosen option indexes;
   * `correctOptionIndex` never travels to it, because that attribute is marked
   * `private` — stripped from every REST response, while still readable through
   * the Document Service, which is what makes this possible.
   */
  async submit(ctx: Context) {
    const { user } = ctx.state;

    if (!user) {
      return ctx.unauthorized('You must be logged in to submit a quiz.');
    }

    // Taking a quiz is a student action. Without this an instructor or manager
    // browsing a course could write a QuizResult row for themselves.
    if (!isStudent(user)) {
      return ctx.forbidden('Only students can submit quiz attempts.');
    }

    const { documentId } = ctx.params;
    const { quiz, course, isFinal, isLesson } = await resolveQuizCourse(documentId);

    if (!quiz) {
      return ctx.notFound('Quiz not found.');
    }

    if (!course) {
      return ctx.badRequest('This quiz is not linked to a course, so it cannot be graded.');
    }

    // Enforced for practice quizzes too. Otherwise anyone holding a quiz id
    // could recover the answer key by submitting repeatedly and reading which
    // questions came back correct.
    if (!(await isEnrolled(user.id, course.documentId))) {
      return ctx.forbidden('You must be enrolled in this course to submit this quiz.');
    }

    const questions: Question[] = Array.isArray(quiz.Question) ? quiz.Question : [];
    const answers = (ctx.request.body as { answers?: unknown } | undefined)?.answers;

    if (!Array.isArray(answers)) {
      return ctx.badRequest('Body must be { "answers": [ ... ] }.');
    }

    if (answers.length !== questions.length) {
      return ctx.badRequest(
        `Expected ${questions.length} answer(s), received ${answers.length}.`
      );
    }

    // null means "skipped"; anything other than null or an integer is a bug in
    // the caller, and silently scoring it as wrong would hide that.
    if (answers.some((answer) => answer !== null && !Number.isInteger(answer))) {
      return ctx.badRequest(
        'Each answer must be an integer option index, or null if the question was skipped.'
      );
    }

    const results = questions.map((question, index) => ({
      questionIndex: index,
      // A question with no answer key recorded can never be scored correct —
      // otherwise a skipped answer would match a missing key.
      correct:
        Number.isInteger(question.correctOptionIndex) &&
        answers[index] === question.correctOptionIndex,
    }));

    const totalQuestions = questions.length;
    const correctCount = results.filter((result) => result.correct).length;
    const score =
      totalQuestions === 0 ? 0 : Math.round((correctCount / totalQuestions) * 10000) / 100;

    // Final and lesson quizzes produce a stored grade; practice quizzes are graded
    // for immediate on-screen feedback and persist nothing. A lesson quiz has to be
    // recorded because the QuizResult row *is* the completion gate — see
    // `lessonQuizGate`; without it a passing score would be forgotten the moment
    // the response was rendered.
    let recorded = false;

    if (isFinal || isLesson) {
      await upsertOne(
        'api::quiz-result.quiz-result',
        { user: { id: user.id }, quiz: { documentId: quiz.documentId } },
        {
          user: user.id,
          quiz: { documentId: quiz.documentId },
          latestScore: score,
          updateTime: new Date().toISOString(),
        }
      );
      recorded = true;
    }

    return {
      data: {
        quizId: quiz.documentId,
        courseId: course.documentId,
        isFinal,
        isLesson,
        /** The lesson this quiz gates, when it gates one. */
        lessonId: (quiz as any).lesson?.documentId ?? null,
        recorded,
        score,
        passMark: QUIZ_PASS_SCORE,
        passed: score >= QUIZ_PASS_SCORE,
        correctCount,
        totalQuestions,
        results,
      },
    };
  },
}));
