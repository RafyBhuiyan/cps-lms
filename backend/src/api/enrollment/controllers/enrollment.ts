/**
 * enrollment controller
 */

import { factories } from '@strapi/strapi';
import type { Context } from 'koa';
import { isPrivileged, isStudent } from '../../../utils/roles';
import {
  ANY_VERSION,
  attachOwner,
  findEnrollment,
  manageableCourseIds,
  scopeQueryToDocuments,
} from '../../../utils/lms';

/**
 * Students hold `enrollment.find`, and Strapi's default `find` is unscoped, so
 * without this a student could enumerate the platform's entire roster.
 */
const scopeForUser = async (user: any): Promise<Record<string, any> | null> => {
  if (isPrivileged(user)) {
    return null;
  }

  if (isStudent(user)) {
    return { user: { id: user.id } };
  }

  const courseIds = await manageableCourseIds(user);
  return { course: { documentId: { $in: courseIds } } };
};

export default factories.createCoreController('api::enrollment.enrollment', () => ({
  async find(ctx: Context) {
    const { user } = ctx.state;

    if (!user) {
      return ctx.unauthorized('You must be logged in to view enrollments.');
    }

    const scope = await scopeForUser(user);

    if (scope) {
      await scopeQueryToDocuments(ctx, 'api::enrollment.enrollment', scope);
    }

    return super.find(ctx);
  },

  async findOne(ctx: Context) {
    const { user } = ctx.state;

    if (!user) {
      return ctx.unauthorized('You must be logged in to view an enrollment.');
    }

    const enrollment = await strapi.documents('api::enrollment.enrollment').findOne({
      documentId: ctx.params.id,
      populate: ['user', 'course'],
      ...ANY_VERSION,
    });

    if (!enrollment) {
      return ctx.notFound('Enrollment not found.');
    }

    if (isStudent(user)) {
      if ((enrollment as any).user?.id !== user.id) {
        return ctx.forbidden('You can only view your own enrollments.');
      }
    } else if (!isPrivileged(user)) {
      const courseId = (enrollment as any).course?.documentId;
      const courseIds = await manageableCourseIds(user);

      if (!courseId || !courseIds.includes(courseId)) {
        return ctx.forbidden('You can only view enrollments for your own courses.');
      }
    }

    return super.findOne(ctx);
  },

  /**
   * POST /api/enrollments
   *
   * A student enrols *themselves*. The `user` is taken from the token and a
   * client-supplied one is discarded, so posting someone else's id enrols the
   * caller rather than the target.
   *
   * The relation is attached after the row exists; see `attachOwner` for why a
   * `user` key in the payload is rejected outright.
   */
  async create(ctx: Context) {
    const { user } = ctx.state;

    if (!user) {
      return ctx.unauthorized('You must be logged in to enrol.');
    }

    if (!isStudent(user)) {
      return ctx.forbidden('Only students can enrol in courses.');
    }

    const body = ctx.request.body as { data?: Record<string, any> } | undefined;

    if (!body?.data || typeof body.data !== 'object') {
      return ctx.badRequest('Missing "data" payload in the request body.');
    }

    const courseRef = body.data.course;
    const courseDocumentId =
      typeof courseRef === 'string' ? courseRef : courseRef?.documentId;

    if (typeof courseDocumentId !== 'string' || !courseDocumentId) {
      return ctx.badRequest('`data.course` must be a course documentId.');
    }

    const course = await strapi.documents('api::course.course').findOne({
      documentId: courseDocumentId,
      ...ANY_VERSION,
    });

    if (!course) {
      return ctx.notFound('Course not found.');
    }

    // Stands in for the composite unique constraint on (user, course) that
    // Strapi cannot declare in a schema.
    if (await findEnrollment(user.id, courseDocumentId)) {
      return ctx.conflict('You are already enrolled in this course.');
    }

    delete body.data.user;
    body.data.course = { documentId: courseDocumentId };
    body.data.enrolledAt = new Date().toISOString();

    const response = (await super.create(ctx)) as { data?: { documentId?: string } };

    if (response?.data?.documentId) {
      await attachOwner(
        'api::enrollment.enrollment',
        response.data.documentId,
        'user',
        user.id
      );
    }

    return response;
  },
}));
