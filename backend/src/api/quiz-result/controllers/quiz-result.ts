/**
 * quiz-result controller
 */

import { factories } from '@strapi/strapi';
import type { Context } from 'koa';
import { isPrivileged, isStudent } from '../../../utils/roles';
import {
  ANY_VERSION,
  manageableCourseIds,
  quizzesOfCourses,
  scopeQueryToDocuments,
  withholdCourseContent,
} from '../../../utils/lms';

/**
 * The Student role is granted `quiz-result.find`, and Strapi's default `find` is
 * unscoped — so without these overrides any logged-in student could list every
 * classmate's grade. The scope is applied to the query before the core
 * controller runs, so pagination and counts stay correct.
 */
const scopeForUser = async (user: any): Promise<Record<string, any> | null> => {
  // admin and content_manager see every result.
  if (isPrivileged(user)) {
    return null;
  }

  if (isStudent(user)) {
    return { user: { id: user.id } };
  }

  // Instructors see results only for courses they own or co-teach. An
  // instructor who owns nothing gets `$in: []`, which matches no rows.
  const courseIds = await manageableCourseIds(user);
  return { quiz: quizzesOfCourses(courseIds) };
};

export default factories.createCoreController('api::quiz-result.quiz-result', () => ({
  /**
   * Scoped to the caller's own rows, then stripped of any questions those rows
   * reach. A result carries a `quiz` relation, so `?populate[quiz][populate][0]=Question`
   * would otherwise hand back the paper of every quiz the caller has ever sat —
   * including one they sat on an enrolment since rejected.
   */
  async find(ctx: Context) {
    const { user } = ctx.state;

    if (!user) {
      return ctx.unauthorized('You must be logged in to view quiz results.');
    }

    const scope = await scopeForUser(user);

    if (scope) {
      await scopeQueryToDocuments(ctx, 'api::quiz-result.quiz-result', scope);
    }

    const response = await super.find(ctx);
    await withholdCourseContent(user, response);
    return response;
  },

  async findOne(ctx: Context) {
    const { user } = ctx.state;

    if (!user) {
      return ctx.unauthorized('You must be logged in to view a quiz result.');
    }

    // Checked against a separate authoritative read rather than the sanitized
    // response, which need not include the `user` relation the check depends on.
    const result = await strapi.documents('api::quiz-result.quiz-result').findOne({
      documentId: ctx.params.id,
      populate: ['user', 'quiz'],
      ...ANY_VERSION,
    });

    if (!result) {
      return ctx.notFound('Quiz result not found.');
    }

    const owner = (result as any).user;

    if (isStudent(user) && owner?.id !== user.id) {
      return ctx.forbidden('You can only view your own quiz results.');
    }

    if (!isStudent(user) && !isPrivileged(user)) {
      const courseIds = await manageableCourseIds(user);
      const quiz = (result as any).quiz;

      const quizCourse = quiz
        ? await strapi.documents('api::quiz.quiz').findOne({
            documentId: quiz.documentId,
            populate: ['course', 'parent_course'],
            ...ANY_VERSION,
          })
        : null;

      const courseId =
        (quizCourse as any)?.course?.documentId ??
        (quizCourse as any)?.parent_course?.documentId ??
        null;

      if (!courseId || !courseIds.includes(courseId)) {
        return ctx.forbidden('You can only view results for your own courses.');
      }
    }

    const response = await super.findOne(ctx);
    await withholdCourseContent(user, response);
    return response;
  },
}));
