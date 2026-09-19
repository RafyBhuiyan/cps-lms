/**
 * Profile routes.
 *
 * A route-only API: there is no `profile` content type, and none is needed —
 * Strapi loads any folder under `src/api` that has routes and controllers
 * (loaders/apis.js), and the permission action is registered from the composed
 * route (compose-endpoint.js:119).
 *
 * New permission action created here — needs ticking in
 * Settings -> Users & Permissions -> Roles, or granting with
 * `npm run permissions`:
 *   api::profile.profile.me   Student, Instructor, Content Manager, Admin
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/profile/me',
      handler: 'profile.me',
    },
  ],
};
