/**
 * enrollment controller
 */

import { factories } from '@strapi/strapi';
import type { Context } from 'koa';
import { isPrivileged, isStudent } from '../../../utils/roles';
import {
  ANY_VERSION,
  ENROLLMENT_STATUS,
  PUBLISHED,
  attachOwner,
  canManageCourseById,
  findEnrollment,
  manageableCourseIds,
  scopeQueryToDocuments,
  type EnrollmentStatus,
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

/**
 * Shared body of `approve` / `reject` / `reopen`.
 *
 * Authorisation lives here rather than in a route policy for two reasons: an
 * enrollment has no owner of its own — the *course* decides who may act on it, so
 * the policy would have to re-load the enrollment anyway — and `findOne` above
 * already authorises this way, so the two cannot drift apart.
 *
 * `canManageCourseById` already means exactly "the course's instructor, a content
 * manager, or an admin", which is the rule this feature asks for, so no new
 * ownership logic is introduced.
 */
const decide = async (ctx: Context, next: EnrollmentStatus, verb: string) => {
  const { user } = ctx.state;

  if (!user) {
    return ctx.unauthorized(`You must be logged in to ${verb} an enrolment request.`);
  }

  const enrollment = await strapi.documents('api::enrollment.enrollment').findOne({
    documentId: ctx.params.documentId,
    populate: ['user', 'course'],
    ...ANY_VERSION,
  });

  if (!enrollment) {
    return ctx.notFound('Enrolment request not found.');
  }

  const courseDocumentId = (enrollment as any).course?.documentId;

  if (!courseDocumentId) {
    return ctx.badRequest('This enrolment is not linked to a course.');
  }

  if (!(await canManageCourseById(user, courseDocumentId))) {
    return ctx.forbidden(
      `You can only ${verb} enrolment requests for a course you manage.`
    );
  }

  const updated = await strapi.documents('api::enrollment.enrollment').update({
    documentId: enrollment.documentId,
    data: { current_status: next } as any,
    // Readers see the published row; writing only the draft would leave the
    // decision invisible to every check that matters.
    ...PUBLISHED,
  });

  return {
    data: {
      documentId: enrollment.documentId,
      current_status: next,
      courseId: courseDocumentId,
      userId: (enrollment as any).user?.id ?? null,
      updatedAt: (updated as any)?.updatedAt ?? null,
    },
  };
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
   * A student *requests* enrolment. The row is created `pending` and grants no
   * access until the course's instructor, a content manager or an admin approves
   * it — `isEnrolled` is what reads that, and it gates lesson completion, quiz
   * submission and progress recording alike.
   *
   * The `user` is taken from the token and a client-supplied one is discarded, so
   * posting someone else's id enrols the caller rather than the target. The status
   * is overwritten for the same reason: a student cannot approve their own request
   * by putting `approved` in the payload.
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
    // Strapi cannot declare in a schema. Deliberately status-agnostic: a pending
    // or rejected request already occupies the pair, so a second POST must be a
    // conflict rather than a duplicate row.
    const existing = await findEnrollment(user.id, courseDocumentId);

    if (existing) {
      const status = (existing as any).current_status;

      if (status === ENROLLMENT_STATUS.PENDING) {
        return ctx.conflict('Your enrolment request is already awaiting approval.');
      }

      if (status === ENROLLMENT_STATUS.REJECTED) {
        return ctx.conflict(
          'Your enrolment request for this course was declined. Contact the instructor to reopen it.'
        );
      }

      return ctx.conflict('You are already enrolled in this course.');
    }

    delete body.data.user;
    body.data.course = { documentId: courseDocumentId };
    body.data.enrolledAt = new Date().toISOString();
    body.data.current_status = ENROLLMENT_STATUS.PENDING;

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

  /** POST /api/enrollments/:documentId/approve — the student gains access. */
  async approve(ctx: Context) {
    return decide(ctx, ENROLLMENT_STATUS.APPROVED, 'approve');
  },

  /** POST /api/enrollments/:documentId/reject — declined, and final until reopened. */
  async reject(ctx: Context) {
    return decide(ctx, ENROLLMENT_STATUS.REJECTED, 'reject');
  },

  /**
   * POST /api/enrollments/:documentId/reopen
   *
   * Returns a declined request to pending. A rejection is deliberately final from
   * the student's side — `create` answers 409 rather than reopening it — so this is
   * the only way back, and it belongs to staff.
   */
  async reopen(ctx: Context) {
    return decide(ctx, ENROLLMENT_STATUS.PENDING, 'reopen');
  },
}));
