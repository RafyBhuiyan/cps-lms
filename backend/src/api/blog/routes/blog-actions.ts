/**
 * Custom blog routes.
 *
 * New permission action created here — needs ticking in
 * Settings -> Users & Permissions -> Roles:
 *   api::blog.blog.publish   Content Manager, Admin
 *
 * Kept in its own file because `createCoreRouter` returns a router object rather
 * than a plain `{ routes: [] }`, and Strapi loads every file under `routes/`
 * (loaders/apis.js:69), so the two cannot be merged into one export.
 */
export default {
  routes: [
    {
      method: 'PUT',
      path: '/blogs/:documentId/publish',
      handler: 'blog.publish',
      config: {
        policies: ['api::blog.can-manage-blog'],
      },
    },
  ],
};
