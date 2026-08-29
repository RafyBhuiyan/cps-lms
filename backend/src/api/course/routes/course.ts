/**
 * course router
 *
 * `update` and `delete` are gated by the ownership policy. `create` is not: any
 * role holding the permission may create a course, and the controller stamps
 * `creator` from the token, so a new course is always owned by its author.
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::course.course', {
  config: {
    update: { policies: ['api::course.can-manage-course'] },
    delete: { policies: ['api::course.can-manage-course'] },
  },
});
