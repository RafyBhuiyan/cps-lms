/**
 * Custom course routes.
 *
 * New permission actions created here — each needs ticking in
 * Settings -> Users & Permissions -> Roles:
 *   api::course.course.progress          Student, Instructor, Content Manager, Admin
 *   api::course.course.studentsProgress   Instructor, Content Manager, Admin
 *   api::course.course.stats              Admin
 *
 * `/admin/stats` is mounted on the course API rather than in its own
 * content-type-less API, which would otherwise exist for a single handler. It
 * resolves to `/api/admin/stats` and does not collide with the admin panel,
 * which is served outside `/api`.
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/courses/:documentId/progress',
      handler: 'course.progress',
    },
    {
      method: 'GET',
      path: '/courses/:documentId/students-progress',
      handler: 'course.studentsProgress',
    },
    {
      method: 'GET',
      path: '/admin/stats',
      handler: 'course.stats',
      config: {
        policies: ['api::course.is-admin'],
      },
    },
  ],
};
