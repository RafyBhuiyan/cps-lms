/**
 * Custom enrollment routes.
 *
 * A separate file from `routes/enrollment.ts` for the reason spelled out in
 * `quiz/routes/quiz-actions.ts`: that file exports the object returned by
 * `createCoreRouter`, whose `routes` array is generated internally, so appending
 * to it registers nothing. The API loader reads every file under `routes/`.
 *
 * Each of these creates a brand-new permission action —
 * `api::enrollment.enrollment.approve` and so on — which must be granted to
 * instructor, content_manager and admin or the endpoint answers 403 before the
 * controller runs. `npm run permissions` does that.
 *
 * No route policy: an enrollment has no owner of its own, so authorisation needs
 * the enrollment's *course*, which the controller has already loaded. See `decide`
 * in the controller.
 */
export default {
  routes: [
    {
      method: 'POST',
      path: '/enrollments/:documentId/approve',
      handler: 'enrollment.approve',
    },
    {
      method: 'POST',
      path: '/enrollments/:documentId/reject',
      handler: 'enrollment.reject',
    },
    {
      method: 'POST',
      path: '/enrollments/:documentId/reopen',
      handler: 'enrollment.reopen',
    },
  ],
};
