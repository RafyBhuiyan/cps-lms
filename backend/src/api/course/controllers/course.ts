/**
 * course controller
 */

import { factories } from '@strapi/strapi';
import type { Context } from 'koa';
import { isAdmin } from '../../../utils/roles';
import {
  ANY_VERSION,
  NO_LIMIT,
  canManageCourse,
  computeCourseProgress,
  scopeQueryToDocuments,
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
   */
  async find(ctx: Context) {
    const query = ctx.query as Record<string, unknown>;
    const mine = query.mine;

    if (mine === undefined) {
      return super.find(ctx);
    }

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

    return super.find(ctx);
  },

  /**
   * POST /api/courses
   *
   * Ownership is server-assigned. A client-supplied `creator` is discarded, so a
   * course cannot be attributed to another user — which matters because
   * `creator` is what every ownership check downstream reads.
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

    body.data.creator = user.id;

    return super.create(ctx);
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
   * Every enrolled student's progress in one course. Restricted to users who can
   * manage the course, so one instructor cannot read another's roster.
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

    const students = await Promise.all(
      enrollments
        .map((enrollment: any) => enrollment.user)
        .filter(Boolean)
        .map(async (student: any) => ({
          userId: student.id,
          username: student.username,
          email: student.email,
          ...(await computeCourseProgress(student.id, documentId)),
          finalQuiz: await finalQuizScore(course, student.id),
        }))
    );

    return {
      data: {
        courseId: documentId,
        totalStudents: students.length,
        // Least-progressed first: the list exists to spot who is falling behind.
        students: students.sort((a, b) => a.progressPercent - b.progressPercent),
      },
    };
  },

  /**
   * GET /api/admin/stats
   *
   * Also guarded by the `is-admin` policy on the route. The check is repeated
   * here so the handler is safe even if the route config is edited later.
   */
  async stats(ctx: Context) {
    const { user } = ctx.state;

    if (!user) {
      return ctx.unauthorized('You must be logged in to view platform statistics.');
    }

    if (!isAdmin(user)) {
      return ctx.forbidden('Administrator access required.');
    }

    // Roles and users are not draft/publish content types, so these go through
    // the query engine directly.
    const roles = await strapi.db.query('plugin::users-permissions.role').findMany({
      select: ['id', 'name', 'type'],
    });

    const usersByRole = await Promise.all(
      roles.map(async (role: any) => ({
        role: role.type,
        name: role.name,
        users: await strapi.db
          .query('plugin::users-permissions.user')
          .count({ where: { role: role.id } }),
      }))
    );

    // Counted with ANY_VERSION so each document counts once; counting published
    // rows would undercount anything still in draft.
    const [totalCourses, totalLessons, totalEnrollments, totalQuizzes, totalBlogs] =
      await Promise.all([
        strapi.documents('api::course.course').count({ ...ANY_VERSION }),
        strapi.documents('api::lesson.lesson').count({ ...ANY_VERSION }),
        strapi.documents('api::enrollment.enrollment').count({ ...ANY_VERSION }),
        strapi.documents('api::quiz.quiz').count({ ...ANY_VERSION }),
        strapi.documents('api::blog.blog').count({ ...ANY_VERSION }),
      ]);

    return {
      data: {
        totalUsers: usersByRole.reduce((sum, entry) => sum + entry.users, 0),
        usersByRole,
        totalCourses,
        totalLessons,
        totalEnrollments,
        totalQuizzes,
        totalBlogs,
      },
    };
  },
}));
