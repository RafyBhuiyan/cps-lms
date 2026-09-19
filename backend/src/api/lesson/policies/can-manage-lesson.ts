/**
 * can-manage-lesson
 *
 * A lesson has no owner of its own — it is owned by whoever owns its course. So
 * this resolves `lesson.course` and defers to `canManageCourse`.
 *
 * Two cases, and update hits both:
 *   - update/delete: the lesson's *current* course must be manageable
 *   - create/update: any course named in the body must also be manageable,
 *     otherwise an instructor could attach a lesson to (or move one into)
 *     someone else's course.
 */

import type { AuthUser } from '../../../utils/roles';
import {
  ANY_VERSION,
  canManageCourseById,
  courseRefFromBody,
} from '../../../utils/lms';

export default async (policyContext: any) => {
  const user = policyContext.state?.user as AuthUser;

  if (!user) {
    return false;
  }

  // `:id` on core routes, `:documentId` on custom ones — read both so this
  // policy stays correct wherever it is attached.
  const documentId = policyContext.params?.id ?? policyContext.params?.documentId;
  const targetCourseId = courseRefFromBody(policyContext.request?.body, 'course');

  // update / delete — the lesson's existing course decides.
  if (documentId) {
    const lesson = await strapi.documents('api::lesson.lesson').findOne({
      documentId,
      populate: ['course'],
      ...ANY_VERSION,
    });

    if (!lesson) {
      return false;
    }

    const currentCourseId = (lesson as any).course?.documentId;

    if (!currentCourseId || !(await canManageCourseById(user, currentCourseId))) {
      return false;
    }

    // Moving the lesson elsewhere requires rights over the destination too.
    if (targetCourseId && targetCourseId !== currentCourseId) {
      return canManageCourseById(user, targetCourseId);
    }

    return true;
  }

  // create — the body must name a course the caller can manage.
  if (!targetCourseId) {
    return false;
  }

  return canManageCourseById(user, targetCourseId);
};
