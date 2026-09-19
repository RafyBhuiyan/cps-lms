/**
 * Custom course routes.
 *
 * New permission actions created here — each needs ticking in
 * Settings -> Users & Permissions -> Roles, or granting with
 * `npm run permissions`:
 *   api::course.course.progress          Student, Instructor, Content Manager, Admin
 *   api::course.course.studentsProgress   Instructor, Content Manager, Admin
 *   api::course.course.setFinalQuiz       Instructor, Content Manager, Admin
 *
 * `setFinalQuiz` is granted to instructors because the policy narrows it further:
 * `can-manage-course` reads the `:documentId` in the path, so an instructor can
 * only reach their own courses.
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
      method: 'PUT',
      path: '/courses/:documentId/final-quiz',
      handler: 'course.setFinalQuiz',
      config: {
        policies: ['api::course.can-manage-course'],
      },
    },
  ],
};
