# CPS LMS

A Strapi + Next.js learning management system with role-based course, lesson, and quiz permissions.

## Run locally

1. Install dependencies:

   ```bash
   cd backend
   npm install

   cd ../frontend
   npm install
   ```

2. Start the Strapi backend:

   ```bash
   cd backend
   npm run develop
   ```

   The API runs on http://localhost:1337.

3. Start the frontend:

   ```bash
   cd frontend
   npm run dev
   ```

   The app runs on http://localhost:3000.

4. Create the roles in the Strapi admin panel if they do not exist yet:

   - admin
   - content_manager
   - instructor

   Only the roles themselves are created there. Assigning people to them is done in
   the app, on the admin's Platform dashboard.

5. Grant the role permissions:

   ```bash
   cd backend
   npm run permissions
   ```

   The custom routes (quiz submit and manage, lesson complete, course progress, blog
   publish, the final-quiz link, and the admin API) each create their own permission
   action, and a route with no grant answers 403 before its controller runs. The
   script is additive — it never revokes anything — and it fails loudly if an action
   name does not exist in the running app. Re-run it after any change to routes or
   controllers.

   Promote your first admin by hand in Settings → Users & Permissions → Users; from
   then on the Platform dashboard does it.

## Completed features

- Role-based access control for admin, content manager, and instructor
- Admin manages accounts and assigns roles from the Platform dashboard
- Admin and content manager can manage any course
- Instructor can only manage their own courses
- Admin and content manager can manage lessons across courses
- Instructor can only manage lessons in their own courses
- Admin and content manager can create quizzes for any lesson
- Instructor can only create quizzes for lessons in their own courses
- In-app quiz authoring for lesson, final, and practice quizzes
- Frontend dashboards for:
  - admin overview, account/role management, and course management
  - instructor course creation and ownership-based controls
  - content manager content/course management
- Course, lesson, and quiz ownership checks enforced on the backend
- Frontend role gate screens for unauthorized access

## Notes

- Quiz answer keys are stored `private`, so they are stripped from every ordinary API
  response and grading happens on the server. Authors read them back through one
  dedicated endpoint behind the same ownership check as the writes.
- Course, quiz, and role management all run through the app UI. The Strapi admin panel
  is only needed to create the three roles and to promote the first admin.
