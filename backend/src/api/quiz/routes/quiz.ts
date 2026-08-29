/**
 * quiz router
 *
 * Write access decides who can change `correctOptionIndex`, so the ownership
 * policy covers create as well as update and delete.
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::quiz.quiz', {
  config: {
    create: { policies: ['api::quiz.can-manage-quiz'] },
    update: { policies: ['api::quiz.can-manage-quiz'] },
    delete: { policies: ['api::quiz.can-manage-quiz'] },
  },
});
