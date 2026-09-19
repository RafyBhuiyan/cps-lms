/**
 * blog router
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::blog.blog', {
  config: {
    create: { policies: ['api::blog.can-manage-blog'] },
    update: { policies: ['api::blog.can-manage-blog'] },
    delete: { policies: ['api::blog.can-manage-blog'] },
  },
});
