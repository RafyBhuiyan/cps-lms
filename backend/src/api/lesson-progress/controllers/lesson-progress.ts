/**
 * lesson-progress controller
 */

import { factories } from '@strapi/strapi';
import type { Context } from 'koa';
import { isPrivileged, isStudent } from '../../../utils/roles';
import {
  ANY_VERSION,
  isEnrolled,
  manageableCourseIds,
  scopeQueryToDocuments,
  upsertOne,
} from '../../../utils/lms';

/**
 * Students hold `lesson-progress.find`, and Strapi's default `find` is unscoped,
 * so without this a student could read every other student's progress.
 */
const scopeForUser = async (user: any): Promise<Record<string, any> | null> => {
  if (isPrivileged(user)) {
    return null;
  }

  if (isStudent(user)) {
    return { user: { id: user.id } };
  }

  const courseIds = await manageableCourseIds(user);
  return { lesson: { course: { documentId: { $in: courseIds } } } };
};

export default factories.createCoreController(
  'api::lesson-progress.lesson-progress',
  () => ({
    async find(ctx: Context) {
      const { user } = ctx.state;

      if (!user) {
        return ctx.unauthorized('You must be logged in to view lesson progress.');
      }

      const scope = await scopeForUser(user);

      if (scope) {
        await scopeQueryToDocuments(
          ctx,
          'api::lesson-progress.lesson-progress',
          scope
        );
      }

      return super.find(ctx);
    },

    async findOne(ctx: Context) {
      const { user } = ctx.state;

      if (!user) {
        return ctx.unauthorized('You must be logged in to view lesson progress.');
      }

      const record = await strapi
        .documents('api::lesson-progress.lesson-progress')
        .findOne({
          documentId: ctx.params.id,
          populate: { user: true, lesson: { populate: ['course'] } } as any,
          ...ANY_VERSION,
        });

      if (!record) {
        return ctx.notFound('Lesson progress not found.');
      }

      if (isStudent(user)) {
        if ((record as any).user?.id !== user.id) {
          return ctx.forbidden('You can only view your own lesson progress.');
        }
      } else if (!isPrivileged(user)) {
        const courseId = (record as any).lesson?.course?.documentId;
        const courseIds = await manageableCourseIds(user);

        if (!courseId || !courseIds.includes(courseId)) {
          return ctx.forbidden('You can only view progress for your own courses.');
        }
      }

      return super.findOne(ctx);
    },

    /**
     * POST /api/lesson-progresses
     *
     * `POST /api/lessons/:documentId/complete` is the intended way in and this
     * permission is best left unticked. It is hardened rather than removed
     * because the permission is currently granted to the Student role: the core
     * handler would accept a client-supplied `user`, letting a student write
     * progress rows for anybody, on any lesson, without being enrolled.
     */
    async create(ctx: Context) {
      const { user } = ctx.state;

      if (!user) {
        return ctx.unauthorized('You must be logged in to record lesson progress.');
      }

      if (!isStudent(user)) {
        return ctx.forbidden('Only students have lesson progress.');
      }

      const body = ctx.request.body as { data?: Record<string, any> } | undefined;

      if (!body?.data || typeof body.data !== 'object') {
        return ctx.badRequest('Missing "data" payload in the request body.');
      }

      const lessonRef = body.data.lesson;
      const lessonDocumentId =
        typeof lessonRef === 'string' ? lessonRef : lessonRef?.documentId;

      if (typeof lessonDocumentId !== 'string' || !lessonDocumentId) {
        return ctx.badRequest('`data.lesson` must be a lesson documentId.');
      }

      const lesson = await strapi.documents('api::lesson.lesson').findOne({
        documentId: lessonDocumentId,
        populate: ['course'],
        ...ANY_VERSION,
      });

      if (!lesson) {
        return ctx.notFound('Lesson not found.');
      }

      const course = (lesson as any).course;

      if (!course) {
        return ctx.badRequest('This lesson is not linked to a course.');
      }

      if (!(await isEnrolled(user.id, course.documentId))) {
        return ctx.forbidden(
          'You must be enrolled in this course to record progress on its lessons.'
        );
      }

      // Upserted, not created: one row per (user, lesson), matching
      // /lessons/:id/complete so the two entry points cannot disagree.
      const { document } = await upsertOne(
        'api::lesson-progress.lesson-progress',
        { user: { id: user.id }, lesson: { documentId: lessonDocumentId } },
        {
          user: user.id,
          lesson: { documentId: lessonDocumentId },
          completed: body.data.completed === false ? false : true,
          completedAt: body.data.completed === false ? null : new Date().toISOString(),
        }
      );

      ctx.status = 201;

      // `PartialWithThis` types the inherited helpers as optional; the factory
      // copies every base method onto the object before use (factories.js:22-26),
      // so it is present at runtime.
      return { data: await this.sanitizeOutput!(document, ctx) };
    },
  })
);
