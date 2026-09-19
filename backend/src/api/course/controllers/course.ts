/**
 * course controller
 */

import { factories } from '@strapi/strapi';
import type { Context } from 'koa';
import {
  ANY_VERSION,
  ENROLLMENT_STATUS,
  NO_LIMIT,
  PUBLISHED,
  attachOwner,
  canManageCourse,
  computeCourseProgress,
  isEnrollmentActive,
  resolveQuizCourse,
  scopeQueryToDocuments,
  uniqueSlug,
  withholdCourseContent,
} from '../../../utils/lms';

/**
 * The stored grade for a course's final quiz, or null when the course has no
 * final quiz or the student has not attempted it. Practice quizzes never appear
 * here — by design they are graded on screen and persist nothing.
 */
const finalQuizScore = async (course: any, userId: number) => {
  const finalQuiz = course?.final_quiz;

  if (!finalQuiz) {
    return null;
  }

  const [result] = await strapi.documents('api::quiz-result.quiz-result').findMany({
    filters: {
      user: { id: userId },
      quiz: { documentId: finalQuiz.documentId },
    },
    limit: 1,
    ...ANY_VERSION,
  });

  return {
    quizId: finalQuiz.documentId,
    attempted: Boolean(result),
    latestScore: (result as any)?.latestScore ?? null,
    updateTime: (result as any)?.updateTime ?? null,
  };
};

export default factories.createCoreController('api::course.course', () => ({
  /**
   * GET /api/courses[?mine=true]
   *
   * The catalog, unchanged, plus one opt-in narrowing: `mine=true` returns only
   * the courses the caller created or co-teaches.
   *
   * It has to be done here because the equivalent client-side filter is
   * impossible. `?filters[creator][id]=<me>` reaches through a relation whose
   * target is the users-permissions user, and the query validator rejects that
   * for any role without `user.find`
   * (validate/visitors/throw-restricted-relations.js:82) — granting which would
   * let instructors enumerate every account on the platform. `mine` needs no such
   * grant: the scope is resolved server-side and only documentIds reach the query.
   *
   * `mine` is removed from the query before delegating; it is not a content-API
   * key, and leaving it in place would risk a 400 from the query validator.
   *
   * Both paths converge on one `super.find` so that the withholding below cannot
   * be skipped by taking the `mine` branch — a course list can populate `lessons`,
   * and from there reach every lesson body and quiz question in it.
   */
  async find(ctx: Context) {
    const query = ctx.query as Record<string, unknown>;
    const mine = query.mine;

    if (mine !== undefined) {
      delete query.mine;

      const { user } = ctx.state;

      if (!user) {
        return ctx.unauthorized('You must be logged in to list your own courses.');
      }

      if (mine === 'true' || mine === '1' || mine === true) {
        await scopeQueryToDocuments(ctx, 'api::course.course', {
          $or: [{ creator: { id: user.id } }, { instructors: { id: user.id } }],
        });
      }
    }

    const response = await super.find(ctx);
    await withholdCourseContent(ctx.state.user, response);
    return response;
  },

  /**
   * GET /api/courses/:documentId
   *
   * Overridden only to withhold content the caller has not enrolled in. This is
   * the request the course page makes, and it populates `lessons`, `final_quiz`
   * and `practice_quizzes` — so it is the widest of the three routes.
   */
  async findOne(ctx: Context) {
    const response = await super.findOne(ctx);
    await withholdCourseContent(ctx.state.user, response);
    return response;
  },

  /**
   * POST /api/courses
   *
   * Ownership is server-assigned. A client-supplied `creator` is discarded, so a
   * course cannot be attributed to another user — which matters because
   * `creator` is what every ownership check downstream reads.
   *
   * Assigned after the row exists rather than in the payload: see `attachOwner`
   * for why a `creator` key in the body is a 400 for every role here.
   */
  async create(ctx: Context) {
    const { user } = ctx.state;

    if (!user) {
      return ctx.unauthorized('You must be logged in to create a course.');
    }

    const body = ctx.request.body as { data?: Record<string, unknown> } | undefined;

    if (!body?.data || typeof body.data !== 'object') {
      return ctx.badRequest('Missing "data" payload in the request body.');
    }

    delete body.data.creator;

    // The content API does not generate uid fields (see `uniqueSlug`), so a course
    // created from the instructor dashboard would have `slug: null` while every
    // seeded or admin-panel course has one.
    if (typeof body.data.slug !== 'string' || (body.data.slug as string).trim() === '') {
      body.data.slug = await uniqueSlug(
        'api::course.course',
        String(body.data.title ?? ''),
        'course'
      );
    }

    const response = (await super.create(ctx)) as { data?: { documentId?: string } };

    if (response?.data?.documentId) {
      await attachOwner('api::course.course', response.data.documentId, 'creator', user.id);
    }

    return response;
  },

  /**
   * GET /api/courses/:documentId/progress[?userId=<id>]
   *
   * Returns completedLessons / totalLessons / progressPercent for a student in a
   * course, plus per-lesson flags and the final quiz grade.
   *
   * Defaults to the caller. Reading someone else's progress requires rights to
   * manage the course, so one student cannot enumerate another's progress.
   */
  async progress(ctx: Context) {
    const { user } = ctx.state;

    if (!user) {
      return ctx.unauthorized('You must be logged in to view progress.');
    }

    const { documentId } = ctx.params;
    const requestedUserId = (ctx.query as Record<string, unknown>).userId;

    let targetUserId: number = user.id;

    if (requestedUserId !== undefined) {
      const parsed = Number(requestedUserId);

      if (!Number.isInteger(parsed) || parsed <= 0) {
        return ctx.badRequest('`userId` must be a positive integer.');
      }

      targetUserId = parsed;
    }

    const course = await strapi.documents('api::course.course').findOne({
      documentId,
      populate: ['creator', 'instructors', 'final_quiz'],
      ...ANY_VERSION,
    });

    if (!course) {
      return ctx.notFound('Course not found.');
    }

    // A student asking for their own progress is always allowed; asking for
    // anyone else's requires course management rights, which no student has.
    if (targetUserId !== user.id && !canManageCourse(user, course)) {
      return ctx.forbidden(
        "You can only view another student's progress for a course you manage."
      );
    }

    const progress = await computeCourseProgress(targetUserId, documentId);

    return {
      data: {
        courseId: documentId,
        userId: targetUserId,
        ...progress,
        finalQuiz: await finalQuizScore(course, targetUserId),
      },
    };
  },

  /**
   * GET /api/courses/:documentId/students-progress
   *
   * Every enrolled student's progress in one course, plus the enrolment requests
   * still waiting on a decision. Restricted to users who can manage the course, so
   * one instructor cannot read another's roster.
   *
   * The pending queue is served from here rather than from the enrollment endpoint
   * because it needs student *names*, and `GET /api/enrollments?populate[user]`
   * cannot supply them: populating through a relation whose target is the
   * users-permissions user is rejected for every role but admin. This handler
   * already populates `user` behind the same `canManageCourse` check, so the queue
   * needs no new endpoint and no new permission.
   */
  async studentsProgress(ctx: Context) {
    const { user } = ctx.state;

    if (!user) {
      return ctx.unauthorized('You must be logged in to view student progress.');
    }

    const { documentId } = ctx.params;

    const course = await strapi.documents('api::course.course').findOne({
      documentId,
      populate: ['creator', 'instructors', 'final_quiz'],
      ...ANY_VERSION,
    });

    if (!course) {
      return ctx.notFound('Course not found.');
    }

    if (!canManageCourse(user, course)) {
      return ctx.forbidden('You can only view student progress for a course you manage.');
    }

    const enrollments = await strapi.documents('api::enrollment.enrollment').findMany({
      filters: { course: { documentId } },
      populate: ['user'],
      limit: NO_LIMIT,
      ...ANY_VERSION,
    });

    const withUser = enrollments.filter((enrollment: any) => enrollment.user);

    // Approved students have progress worth showing. Pending and rejected ones do
    // not — they have never been able to complete anything — so they are listed
    // separately as decisions to make rather than as rows of 0%.
    const active = withUser.filter(isEnrollmentActive);
    const undecided = withUser.filter((enrollment: any) => !isEnrollmentActive(enrollment));

    const students = await Promise.all(
      active.map(async (enrollment: any) => ({
        userId: enrollment.user.id,
        username: enrollment.user.username,
        email: enrollment.user.email,
        enrollmentId: enrollment.documentId,
        ...(await computeCourseProgress(enrollment.user.id, documentId)),
        finalQuiz: await finalQuizScore(course, enrollment.user.id),
      }))
    );

    return {
      data: {
        courseId: documentId,
        totalStudents: students.length,
        // Least-progressed first: the list exists to spot who is falling behind.
        students: students.sort((a, b) => a.progressPercent - b.progressPercent),
        pendingRequests: undecided
          .map((enrollment: any) => ({
            enrollmentId: enrollment.documentId,
            userId: enrollment.user.id,
            username: enrollment.user.username,
            email: enrollment.user.email,
            currentStatus: enrollment.current_status ?? ENROLLMENT_STATUS.PENDING,
            requestedAt: enrollment.enrolledAt ?? enrollment.createdAt ?? null,
          }))
          // Oldest request first — the person who has been waiting longest.
          .sort((a: any, b: any) => String(a.requestedAt).localeCompare(String(b.requestedAt))),
      },
    };
  },

  /**
   * PUT /api/courses/:documentId/final-quiz
   *
   * Body: `{ "quiz": "<documentId>" }`, or `{ "quiz": null }` to unset.
   *
   * This route exists because of which side owns the relation. `Course.final_quiz`
   * is the `inversedBy` side, so the link has to be written from the *course* —
   * setting `course` on the quiz does nothing at all. Rather than make every
   * caller know that, the frontend creates a quiz under `parent_course` (which the
   * quiz does own) and then promotes it here.
   *
   * A quiz leaving the final slot is demoted to a practice quiz of the same course
   * rather than detached. A quiz with none of the three relations set is reachable
   * by nobody: `can-manage-quiz` cannot resolve its course, so it can no longer be
   * edited or even deleted over REST, and `submit` refuses to grade it.
   *
   * Guarded by `can-manage-course` on the route, so an instructor can only do this
   * to their own course.
   */
  async setFinalQuiz(ctx: Context) {
    const { user } = ctx.state;

    if (!user) {
      return ctx.unauthorized('You must be logged in to set a final quiz.');
    }

    const { documentId } = ctx.params;

    const course = await strapi.documents('api::course.course').findOne({
      documentId,
      populate: ['creator', 'instructors', 'final_quiz'],
      ...ANY_VERSION,
    });

    if (!course) {
      return ctx.notFound('Course not found.');
    }

    // Repeated from the route policy so the handler is safe on its own.
    if (!canManageCourse(user, course)) {
      return ctx.forbidden('You can only change the final quiz of a course you manage.');
    }

    const requested = (ctx.request.body as { quiz?: unknown } | undefined)?.quiz;

    if (requested !== null && typeof requested !== 'string') {
      return ctx.badRequest('Body must be { "quiz": "<documentId>" } or { "quiz": null }.');
    }

    const previous = (course as any).final_quiz?.documentId ?? null;
    const next = requested === null || requested === '' ? null : requested;

    if (next) {
      const { quiz, course: attachedTo } = await resolveQuizCourse(next, ANY_VERSION);

      if (!quiz) {
        return ctx.notFound('Quiz not found.');
      }

      // A quiz belongs in one place. Silently stealing one from another course —
      // or off a lesson it currently gates — would break that lesson's gate.
      if (attachedTo && attachedTo.documentId !== documentId) {
        return ctx.badRequest(
          'That quiz belongs to another course. Create a new quiz for this one instead.'
        );
      }

      if ((quiz as any).lesson) {
        return ctx.badRequest(
          'That quiz gates a lesson. Detach it from the lesson before making it the final quiz.'
        );
      }
    }

    // Set the course side first. Clearing `parent_course` before the final link
    // exists would leave the quiz momentarily orphaned, and unrecoverable if the
    // second write failed.
    //
    // All three writes are PUBLISHED, not ANY_VERSION: every reader of a course
    // takes the published version — `getCourse` in the frontend, the catalog, the
    // course page — so writing only the draft would set a final quiz that nothing
    // outside the authoring screen could see. Publishing is safe here because the
    // content API publishes a course on create and on every ordinary update, so a
    // course in this app is never deliberately left in draft.
    await strapi.documents('api::course.course').update({
      documentId,
      data: { final_quiz: next } as any,
      ...PUBLISHED,
    });

    if (next) {
      // Otherwise it stays listed as a practice quiz as well, and the course page
      // would offer the same quiz twice.
      await strapi.documents('api::quiz.quiz').update({
        documentId: next,
        data: { parent_course: null } as any,
        ...PUBLISHED,
      });
    }

    if (previous && previous !== next) {
      await strapi.documents('api::quiz.quiz').update({
        documentId: previous,
        data: { parent_course: documentId } as any,
        ...PUBLISHED,
      });
    }

    return {
      data: {
        courseId: documentId,
        finalQuizId: next,
        /** Set when the quiz that used to hold the slot was demoted to practice. */
        demotedToPractice: previous && previous !== next ? previous : null,
      },
    };
  },
}));
