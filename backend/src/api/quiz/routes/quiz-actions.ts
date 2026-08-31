/**
 * Custom quiz routes.
 *
 * Deliberately a separate file from `routes/quiz.ts`. That file exports the
 * object returned by `createCoreRouter`, whose `routes` array is generated
 * internally — appending to it does not register anything. The API loader reads
 * every file under `routes/` (loaders/apis.js:69), so both are picked up.
 *
 * New permission actions created here — each needs ticking in
 * Settings -> Users & Permissions -> Roles, or granting with
 * `npm run permissions`:
 *   api::quiz.quiz.submit   Student
 *   api::quiz.quiz.manage   Instructor, Content Manager, Admin
 *
 * `manage` returns the answer key, so it carries the same ownership policy as the
 * write routes. `can-manage-quiz` is already correct for a request with no body:
 * it finds no target courses, falls through to its existing-course branch, and
 * checks the quiz's own course — which is exactly the question being asked here.
 */
export default {
  routes: [
    {
      method: 'POST',
      path: '/quizzes/:documentId/submit',
      handler: 'quiz.submit',
    },
    {
      method: 'GET',
      path: '/quizzes/:documentId/manage',
      handler: 'quiz.manage',
      config: {
        policies: ['api::quiz.can-manage-quiz'],
      },
    },
  ],
};
