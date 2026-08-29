/**
 * lesson router
 *
 * `create` is gated too, not just update/delete: without it an instructor could
 * add lessons to a course they do not own, which also inflates that course's
 * lesson total and so distorts every student's progress percentage.
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::lesson.lesson', {
  config: {
    create: { policies: ['api::lesson.can-manage-lesson'] },
    update: { policies: ['api::lesson.can-manage-lesson'] },
    delete: { policies: ['api::lesson.can-manage-lesson'] },
  },
});
