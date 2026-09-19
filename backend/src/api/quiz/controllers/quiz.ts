/**
 * quiz controller
 */

import { factories } from '@strapi/strapi';
import type { Context } from 'koa';
import { isStudent } from '../../../utils/roles';
import {
  ANY_VERSION,
  QUIZ_PASS_SCORE,
  isEnrolled,
  resolveQuizCourse,
  upsertOne,
  withholdCourseContent,
} from '../../../utils/lms';

type Question = {
  questionText?: string;
  options?: unknown;
  correctOptionIndex?: number | null;
};

/**
 * `options` is a `json` column and `correctOptionIndex` a plain integer, so the
 * schema validates neither the shape of the list nor whether the answer key points
 * inside it. Nothing else would catch a malformed question: `optionsOf` in the
 * frontend's QuizRunner would render an empty list, and `submit` would grade every
 * attempt at that question wrong — a quiz nobody can pass, with no error anywhere.
 *
 * Returns the first problem found, or null when the set is sound.
 */
const questionProblem = (questions: unknown): string | null => {
  if (!Array.isArray(questions)) {
    return 'The "Question" field must be a list of questions.';
  }

  for (const [index, question] of questions.entries()) {
    const at = `Question ${index + 1}`;

    if (!question || typeof question !== 'object') {
      return `${at} is not an object.`;
    }

    const { questionText, options, correctOptionIndex } = question as Question;

    if (typeof questionText !== 'string' || questionText.trim() === '') {
      return `${at} has no text.`;
    }

    if (!Array.isArray(options) || options.length < 2) {
      return `${at} needs at least two options.`;
    }

    if (options.some((option) => typeof option !== 'string' || option.trim() === '')) {
      return `${at} has a blank option.`;
    }

    if (
      !Number.isInteger(correctOptionIndex) ||
      (correctOptionIndex as number) < 0 ||
      (correctOptionIndex as number) >= options.length
    ) {
      return `${at} must mark one of its ${options.length} options as correct.`;
    }
  }

  return null;
};

/**
 * Checked on the way in, but only when the payload carries questions. The lesson
 * editor sends relation-only writes — `{ data: { lesson: … } }` — and rejecting
 * those for having no questions would break attaching a quiz to a lesson.
 */
const rejectMalformedQuestions = (ctx: Context): boolean => {
  const data = (ctx.request.body as { data?: Record<string, unknown> } | undefined)?.data;

  if (!data || !('Question' in data)) {
    return false;
  }

  const problem = questionProblem(data.Question);

  if (problem) {
    ctx.badRequest(problem);
    return true;
  }

  return false;
};

export default factories.createCoreController('api::quiz.quiz', () => ({
  /**
   * GET /api/quizzes
   *
   * The catalog of quizzes, minus the questions of any quiz whose course the
   * caller is not enrolled in. A quiz's *existence* is not a secret — the course
   * page says a final quiz is there — but its questions are, and they stay
   * withheld until the student is enrolled and taking it.
   *
   * See `withholdCourseContent` for why this is done to the response rather than
   * to the `populate` query.
   */
  async find(ctx: Context) {
    const response = await super.find(ctx);
    await withholdCourseContent(ctx.state.user, response, 'quiz');
    return response;
  },

  /** GET /api/quizzes/:documentId — same withholding as `find`. */
  async findOne(ctx: Context) {
    const response = await super.findOne(ctx);
    await withholdCourseContent(ctx.state.user, response, 'quiz');
    return response;
  },

  /**
   * POST /api/quizzes
   *
   * `correctOptionIndex` is `private`, which in Strapi 5 is *output-only*: the
   * input sanitizer strips ids, non-writable attributes, unknown fields and
   * restricted relations, and `private` is none of those. So the answer key can be
   * authored over REST, and the only thing standing between an instructor and
   * another instructor's quiz is `can-manage-quiz` on the route.
   *
   * Which quiz this becomes is decided by the relation in the body — `lesson` for
   * a lesson quiz, `parent_course` for a practice quiz. A final quiz cannot be
   * created from this side at all: `Course.final_quiz` is the owning side of that
   * relation, so it is set through `PUT /api/courses/:documentId/final-quiz`.
   */
  async create(ctx: Context) {
    if (rejectMalformedQuestions(ctx)) {
      return;
    }

    return super.create(ctx);
  },

  /** PUT /api/quizzes/:documentId — same validation as `create`. */
  async update(ctx: Context) {
    if (rejectMalformedQuestions(ctx)) {
      return;
    }

    return super.update(ctx);
  },

  /**
   * GET /api/quizzes/:documentId/manage
   *
   * A quiz including its answer key, for someone allowed to change it.
   *
   * This endpoint exists because `correctOptionIndex` is stripped from every
   * normal REST response — which is what keeps students from reading it, but also
   * means an author loading a quiz to edit would see every question with its
   * answer blanked and would overwrite the key on the first save.
   *
   * The response is assembled field by field rather than returned from the
   * document, because this is the one place the answer key leaves the server: a
   * spread would quietly start shipping any attribute added to the quiz later.
   */
  async manage(ctx: Context) {
    const { user } = ctx.state;

    if (!user) {
      return ctx.unauthorized('You must be logged in to edit a quiz.');
    }

    const { documentId } = ctx.params;

    // ANY_VERSION, not the published copy grading uses: an author has to see what
    // they are about to edit.
    const { quiz, course, isFinal, isLesson } = await resolveQuizCourse(
      documentId,
      ANY_VERSION
    );

    if (!quiz) {
      return ctx.notFound('Quiz not found.');
    }

    const questions: Question[] = Array.isArray(quiz.Question) ? quiz.Question : [];

    return {
      data: {
        documentId: quiz.documentId,
        questions: questions.map((question) => ({
          questionText: question.questionText ?? '',
          options: Array.isArray(question.options) ? question.options : [],
          correctOptionIndex: Number.isInteger(question.correctOptionIndex)
            ? question.correctOptionIndex
            : null,
        })),
        course: course
          ? { documentId: course.documentId, title: (course as any).title ?? null }
          : null,
        lesson: (quiz as any).lesson
          ? {
              documentId: (quiz as any).lesson.documentId,
              title: (quiz as any).lesson.title ?? null,
            }
          : null,
        isFinal,
        isLesson,
        isPractice: Boolean((quiz as any).parent_course),
      },
    };
  },

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
