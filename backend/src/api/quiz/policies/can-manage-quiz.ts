/**
 * can-manage-quiz
 *
 * Same shape as `can-manage-lesson`, but a quiz reaches its course through one of
 * three relations: `course` (final quiz), `parent_course` (practice quiz), or the
 * `lesson` it gates. Any one of them is enough to establish ownership.
 *
 * The `lesson` hop is load-bearing in both directions:
 *
 *   * Without it a quiz attached only to a lesson has no resolvable course, so
 *     nobody — not even an admin — could edit or delete it over REST.
 *   * A `lesson` named in the *body* is checked too. Otherwise an instructor could
 *     create a quiz under their own `parent_course` and attach it to another
 *     instructor's lesson, gating that lesson behind a quiz they control.
 *
 * This is also the policy that keeps the answer key safe from writes: without it
 * any instructor could edit `correctOptionIndex` on another instructor's quiz.
 */

import type { AuthUser } from '../../../utils/roles';
import {
  ANY_VERSION,
  canManageCourseById,
  courseIdOfLesson,
  courseRefFromBody,
} from '../../../utils/lms';

/** Every course this body is trying to reach, directly or through a lesson. */
const targetCoursesFromBody = async (body: any): Promise<string[]> => {
  const direct = [
    courseRefFromBody(body, 'course'),
    courseRefFromBody(body, 'parent_course'),
  ].filter((id): id is string => Boolean(id));

  const lessonId = courseRefFromBody(body, 'lesson');

  if (!lessonId) {
    return direct;
  }

  const viaLesson = await courseIdOfLesson(lessonId);

  // A lesson that belongs to no course is unresolvable, and an unresolvable
  // target is denied rather than ignored — otherwise naming one would be a way
  // past this check.
  return [...direct, viaLesson ?? ''];
};

export default async (policyContext: any) => {
  const user = policyContext.state?.user as AuthUser;

  if (!user) {
    return false;
  }

  // `:id` on core routes, `:documentId` on custom ones — read both so this
  // policy stays correct wherever it is attached.
  const documentId = policyContext.params?.id ?? policyContext.params?.documentId;
  const targets = await targetCoursesFromBody(policyContext.request?.body);

  // Every course the body names must be manageable, whichever relation named it.
  for (const target of targets) {
    if (!target || !(await canManageCourseById(user, target))) {
      return false;
    }
  }

  // create — the body alone decides, and it has to name something.
  if (!documentId) {
    return targets.length > 0;
  }

  // update / delete — the quiz's existing course decides as well.
  const quiz = await strapi.documents('api::quiz.quiz').findOne({
    documentId,
    populate: { course: true, parent_course: true, lesson: { populate: ['course'] } } as any,
    ...ANY_VERSION,
  });

  if (!quiz) {
    return false;
  }

  const currentCourseId =
    (quiz as any).course?.documentId ??
    (quiz as any).parent_course?.documentId ??
    (quiz as any).lesson?.course?.documentId;

  return Boolean(currentCourseId) && canManageCourseById(user, currentCourseId);
};
