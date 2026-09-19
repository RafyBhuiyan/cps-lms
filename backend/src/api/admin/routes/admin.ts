/**
 * Admin routes.
 *
 * A route-only API, like `src/api/profile`: there is no `admin` content type and
 * none is needed — Strapi loads any folder under `src/api` that has routes and
 * controllers (loaders/apis.js), and the permission action is registered from the
 * composed route (compose-endpoint.js:119).
 *
 * The folder name does not collide with the Strapi admin panel. User APIs are
 * namespaced `api::`, the panel's own types are `admin::`, and the panel is served
 * outside `/api` — so `api::admin.admin.*` and `/api/admin/*` are both ours.
 *
 * New permission actions created here — each needs ticking in
 * Settings -> Users & Permissions -> Roles, or granting with
 * `npm run permissions`:
 *   api::admin.admin.stats         Admin
 *   api::admin.admin.users         Admin
 *   api::admin.admin.setUserRole   Admin
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/admin/stats',
      handler: 'admin.stats',
      config: {
        policies: ['api::admin.is-admin'],
      },
    },
    {
      method: 'GET',
      path: '/admin/users',
      handler: 'admin.users',
      config: {
        policies: ['api::admin.is-admin'],
      },
    },
    {
      // PUT rather than POST: assigning a role is idempotent, and the same call
      // with the same body twice must not create anything.
      method: 'PUT',
      path: '/admin/users/:id/role',
      handler: 'admin.setUserRole',
      config: {
        policies: ['api::admin.is-admin'],
      },
    },
  ],
};
