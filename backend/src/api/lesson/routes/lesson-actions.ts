/**
 * Custom lesson routes.
 *
 * `api::lesson.lesson.complete` is a new permission action and must be ticked
 * for the Student role, or this returns 403 before the controller runs.
 */
export default {
  routes: [
    {
      method: 'POST',
      path: '/lessons/:documentId/complete',
      handler: 'lesson.complete',
    },
  ],
};
