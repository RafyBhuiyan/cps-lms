/**
 * lesson controller
 */

import { factories } from '@strapi/strapi';
import type { Context } from 'koa';
import { isStudent } from '../../../utils/roles';
import {
  PUBLISHED,
  QUIZ_PASS_SCORE,
  computeCourseProgress,
  isEnrolled,
  lessonQuizGate,
  upsertOne,
} from '../../../utils/lms';

export default factories.createCoreController('api::lesson.lesson', () => ({
  /**
   * POST /api/lessons/:documentId/complete
   *
   * Marks a lesson complete for the calling student and returns the recomputed
   * course progress in the same response, so the UI updates the progress bar
   * without a second round trip.
   *
   * Idempotent: completing an already-complete lesson updates the existing row
   * rather than adding another, so the percentage cannot drift above 100.
   */
  async complete(ctx: Context) {
    const { user } = ctx.state;

    if (!user) {
      return ctx.unauthorized('You must be logged in to complete a lesson.');
    }

    if (!isStudent(user)) {
      return ctx.forbidden('Only students can complete lessons.');
    }

    const { documentId } = ctx.params;

    const lesson = await strapi.documents('api::lesson.lesson').findOne({
      documentId,
      populate: ['course'],
      ...PUBLISHED,
    });

    if (!lesson) {
      return ctx.notFound('Lesson not found.');
    }

    const course = (lesson as any).course;

    if (!course) {
      return ctx.badRequest('This lesson is not linked to a course.');
    }

    // Without this, any student could mark progress on any course's lessons.
    if (!(await isEnrolled(user.id, course.documentId))) {
      return ctx.forbidden('You must be enrolled in this course to complete its lessons.');
    }

    // A lesson with a quiz cannot be ticked off until that quiz is passed. Enforced
    // here *and* in `lesson-progress.create`, which students also hold and which
    // accepts `completed: true` directly — a gate on only one of the two would be
    // one POST away from irrelevant.
    const gate = await lessonQuizGate(user.id, lesson.documentId);

    if (gate.quizRequired && !gate.quizPassed) {
      return ctx.forbidden(
        gate.latestScore === null
          ? `You must pass this lesson's quiz (${QUIZ_PASS_SCORE}% or higher) before completing the lesson.`
          : `You scored ${gate.latestScore}% on this lesson's quiz; ${QUIZ_PASS_SCORE}% is needed to complete the lesson.`
      );
    }

    await upsertOne(
      'api::lesson-progress.lesson-progress',
      { user: { id: user.id }, lesson: { documentId: lesson.documentId } },
      {
        user: user.id,
        lesson: { documentId: lesson.documentId },
        completed: true,
        completedAt: new Date().toISOString(),
      }
    );

    const progress = await computeCourseProgress(user.id, course.documentId);

    return {
      data: {
        lessonId: lesson.documentId,
        courseId: course.documentId,
        completed: true,
        progress,
      },
    };
  },
}));
