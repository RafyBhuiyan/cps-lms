/**
 * lesson controller
 */

import { factories } from '@strapi/strapi';
import type { Context } from 'koa';
import { isStudent } from '../../../utils/roles';
import {
  PUBLISHED,
  computeCourseProgress,
  isEnrolled,
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
