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

4. Create roles in the Strapi admin panel if needed:

   - admin
   - content_manager
   - instructor

   Then assign users to those roles in Settings → Users & Permissions → Users.

## Completed features

- Role-based access control for admin, content manager, and instructor
- Admin and content manager can manage any course
- Instructor can only manage their own courses
- Admin and content manager can manage lessons across courses
- Instructor can only manage lessons in their own courses
- Admin and content manager can create quizzes for any lesson
- Instructor can only create quizzes for lessons in their own courses
- Frontend dashboards for:
  - admin overview and course management
  - instructor course creation and ownership-based controls
  - content manager content/course management
- Course, lesson, and quiz ownership checks enforced on the backend
- Frontend role gate screens for unauthorized access

## Notes

- Quiz question editing remains in the Strapi admin for secure answer-key handling.
- Course creation and management are routed through the app UI, while role assignment is managed in Strapi admin.
