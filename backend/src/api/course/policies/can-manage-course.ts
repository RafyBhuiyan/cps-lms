/**
 * can-manage-course
 *
 * Guards the core `update` and `delete` routes: admin and content_manager may
 * manage any course, an instructor only their own. Without this, any instructor
 * could edit or delete another instructor's course.
 *
 * Returning anything other than `true`/`undefined` makes Strapi raise a
 * PolicyError (403), so every deny path below returns an explicit `false` —
 * `undefined` would silently *allow* the request (services/server/policy.js:15).
 */

import { canManageCourse, loadCourseForOwnership } from '../../../utils/lms';

export default async (policyContext: any) => {
  const { user } = policyContext.state;

  if (!user) {
    return false;
  }

  // Core routes are `/courses/:id`, where `:id` carries the documentId; custom
  // routes in this API use `:documentId`. Read both.
  const documentId = policyContext.params?.id ?? policyContext.params?.documentId;

  if (!documentId) {
    return false;
  }

  const course = await loadCourseForOwnership(documentId);

  if (!course) {
    return false;
  }

  return canManageCourse(user, course);
};
