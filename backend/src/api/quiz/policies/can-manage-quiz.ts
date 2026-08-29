/**
 * can-manage-quiz
 *
 * Same shape as `can-manage-lesson`, but a quiz reaches its course through one
 * of two relations: `course` (final quiz) or `parent_course` (practice quiz).
 * Either one is enough to establish ownership.
 *
 * This is the policy that keeps the answer key safe from writes: without it any
 * instructor could edit `correctOptionIndex` on another instructor's quiz.
 */

import type { AuthUser } from '../../../utils/roles';
import {
  ANY_VERSION,
  canManageCourseById,
  courseRefFromBody,
} from '../../../utils/lms';

/** The course documentId a body is trying to attach this quiz to, if any. */
const targetCourseFromBody = (body: any): string | null =>
  courseRefFromBody(body, 'course') ?? courseRefFromBody(body, 'parent_course');

export default async (policyContext: any) => {
  const user = policyContext.state?.user as AuthUser;

  if (!user) {
    return false;
  }

  // `:id` on core routes, `:documentId` on custom ones — read both so this
  // policy stays correct wherever it is attached.
  const documentId = policyContext.params?.id ?? policyContext.params?.documentId;
  const targetCourseId = targetCourseFromBody(policyContext.request?.body);

  if (documentId) {
    const quiz = await strapi.documents('api::quiz.quiz').findOne({
      documentId,
      populate: ['course', 'parent_course'],
      ...ANY_VERSION,
    });

    if (!quiz) {
      return false;
    }

    const currentCourseId =
      (quiz as any).course?.documentId ?? (quiz as any).parent_course?.documentId;

    if (!currentCourseId || !(await canManageCourseById(user, currentCourseId))) {
      return false;
    }

    if (targetCourseId && targetCourseId !== currentCourseId) {
      return canManageCourseById(user, targetCourseId);
    }

    return true;
  }

  if (!targetCourseId) {
    return false;
  }

  return canManageCourseById(user, targetCourseId);
};
