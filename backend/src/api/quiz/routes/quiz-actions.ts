/**
 * Custom quiz routes.
 *
 * Deliberately a separate file from `routes/quiz.ts`. That file exports the
 * object returned by `createCoreRouter`, whose `routes` array is generated
 * internally — appending to it does not register anything. The API loader reads
 * every file under `routes/` (loaders/apis.js:69), so both are picked up.
 *
 * Each custom route creates a brand-new permission action. `api::quiz.quiz.submit`
 * must be ticked for the Student role under Settings -> Users & Permissions ->
 * Roles, or this endpoint returns 403 before the controller ever runs.
 */
export default {
  routes: [
    {
      method: 'POST',
      path: '/quizzes/:documentId/submit',
      handler: 'quiz.submit',
    },
  ],
};
