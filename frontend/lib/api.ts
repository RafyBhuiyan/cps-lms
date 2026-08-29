/**
 * Every API call this app makes, in one file.
 *
 * A few of these look more roundabout than they should, and the reason is always
 * the same: Strapi rejects a filter or populate that reaches through a relation
 * unless the *caller's* role holds `find` on the relation's target type. A student
 * cannot filter their own rows by `user`, and an instructor cannot filter courses
 * by `creator`, so those scopes are resolved server-side instead — see
 * `listMyCourses` and the scoped `find` overrides in the backend controllers.
 */

import { request, type StrapiList, type StrapiSingle } from './strapi';
import type {
  Blog,
  Course,
  CourseProgress,
  Enrollment,
  Lesson,
  LessonCompletion,
  LessonProgress,
  PlatformStats,
  Profile,
  Quiz,
  QuizResult,
  QuizSubmission,
  StudentsProgress,
} from './types';

/**
 * The REST layer caps `pageSize` at 100 (`config/api.ts`), and this app's lists
 * are small enough that one page is always the whole set. Anything larger would
 * be silently truncated, so it is spelled out rather than left to the default 25.
 */
const ALL = 'pagination[pageSize]=100';

/* -------------------------------------------------------------------------- */
/* Auth                                                                      */
/* -------------------------------------------------------------------------- */

type AuthResponse = { jwt: string; user: { id: number; username: string; email: string } };

export const login = (identifier: string, password: string) =>
  request<AuthResponse>('/api/auth/local', {
    method: 'POST',
    body: { identifier, password },
  });

/**
 * Sign-ups land in the default role, which is Student. Instructor, content
 * manager and admin accounts are assigned in the Strapi dashboard.
 */
export const register = (username: string, email: string, password: string) =>
  request<AuthResponse>('/api/auth/local/register', {
    method: 'POST',
    body: { username, email, password },
  });

/**
 * Who the token belongs to, and — the part no built-in endpoint gives us — which
 * role they hold. `/api/users/me?populate=role` would need `find` on the role
 * type, which also exposes every role's permission set.
 */
export const getProfile = (token: string) =>
  request<StrapiSingle<Profile>>('/api/profile/me', { token }).then((r) => r.data);

/* -------------------------------------------------------------------------- */
/* Courses                                                                   */
/* -------------------------------------------------------------------------- */

export const listCourses = (token?: string | null) =>
  request<StrapiList<Course>>(`/api/courses?sort=createdAt:desc&${ALL}`, { token }).then(
    (r) => r.data
  );

/** Courses the caller created or co-teaches. See the `mine` branch in the backend. */
export const listMyCourses = (token: string) =>
  request<StrapiList<Course>>(`/api/courses?mine=true&sort=createdAt:desc&${ALL}`, {
    token,
  }).then((r) => r.data);

/**
 * A course with its lessons and quizzes.
 *
 * Populating these needs `find` on lesson and quiz, which anonymous visitors do
 * not have — for them the relations are silently dropped rather than erroring, so
 * the page still renders and simply invites them to sign in.
 */
export const getCourse = (documentId: string, token?: string | null) =>
  request<StrapiSingle<Course>>(
    `/api/courses/${documentId}?populate[lessons]=true&populate[final_quiz]=true&populate[practice_quizzes]=true`,
    { token }
  ).then((r) => r.data);

export const createCourse = (data: { title: string; description: string }, token: string) =>
  request<StrapiSingle<Course>>('/api/courses', {
    token,
    method: 'POST',
    // `creator` is assigned from the token server-side; sending one is pointless.
    body: { data },
  }).then((r) => r.data);

/* -------------------------------------------------------------------------- */
/* Progress                                                                  */
/* -------------------------------------------------------------------------- */

/** Defaults to the caller. `userId` is only accepted from someone who manages the course. */
export const getCourseProgress = (courseId: string, token: string, userId?: number) =>
  request<StrapiSingle<CourseProgress>>(
    `/api/courses/${courseId}/progress${userId ? `?userId=${userId}` : ''}`,
    { token }
  ).then((r) => r.data);

export const getStudentsProgress = (courseId: string, token: string) =>
  request<StrapiSingle<StudentsProgress>>(`/api/courses/${courseId}/students-progress`, {
    token,
  }).then((r) => r.data);

/** Idempotent, and returns the recomputed course progress in the same response. */
export const completeLesson = (lessonId: string, token: string) =>
  request<StrapiSingle<LessonCompletion>>(`/api/lessons/${lessonId}/complete`, {
    token,
    method: 'POST',
    body: {},
  }).then((r) => r.data);

/**
 * The only way back to "not completed": `/complete` never un-completes. The
 * controller upserts on (user, lesson), so this updates the existing row.
 */
export const uncompleteLesson = (lessonId: string, token: string) =>
  request<StrapiSingle<LessonProgress>>('/api/lesson-progresses', {
    token,
    method: 'POST',
    body: { data: { lesson: lessonId, completed: false } },
  }).then((r) => r.data);

/* -------------------------------------------------------------------------- */
/* Lessons and quizzes                                                       */
/* -------------------------------------------------------------------------- */

export const getLesson = (documentId: string, token: string) =>
  request<StrapiSingle<Lesson>>(`/api/lessons/${documentId}?populate[course]=true`, {
    token,
  }).then((r) => r.data);

/**
 * The questions and options, never the answer key: `correctOptionIndex` is
 * `private` in the schema, so it is stripped from every REST response. Grading
 * happens in `submitQuiz`.
 *
 * `course` / `parent_course` are populated because they are the only way to tell a
 * final quiz from a practice one.
 */
export const getQuiz = (documentId: string, token: string) =>
  request<StrapiSingle<Quiz>>(
    `/api/quizzes/${documentId}?populate[Question]=true&populate[course]=true&populate[parent_course]=true`,
    { token }
  ).then((r) => r.data);

/** `answers[i]` is the chosen option index, or null for a skipped question. */
export const submitQuiz = (quizId: string, answers: (number | null)[], token: string) =>
  request<StrapiSingle<QuizSubmission>>(`/api/quizzes/${quizId}/submit`, {
    token,
    method: 'POST',
    body: { answers },
  }).then((r) => r.data);

/* -------------------------------------------------------------------------- */
/* Enrollment and results                                                    */
/* -------------------------------------------------------------------------- */

/** Scoped server-side to the caller's own rows. */
export const listEnrollments = (token: string) =>
  request<StrapiList<Enrollment>>(`/api/enrollments?populate[course]=true&${ALL}`, {
    token,
  }).then((r) => r.data);

export const enroll = (courseId: string, token: string) =>
  request<StrapiSingle<Enrollment>>('/api/enrollments', {
    token,
    method: 'POST',
    // `user` comes from the token; enrolling twice answers 409.
    body: { data: { course: courseId } },
  }).then((r) => r.data);

/** Only final quizzes are ever recorded, so this is the student's grade book. */
export const listQuizResults = (token: string) =>
  request<StrapiList<QuizResult>>(
    `/api/quiz-results?populate[quiz][populate][0]=course&sort=updateTime:desc&${ALL}`,
    { token }
  ).then((r) => r.data);

/* -------------------------------------------------------------------------- */
/* Blog                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Drafts are filtered out by the API, not here: a reader simply never receives
 * one, while an author receives their own. `author` is not populated — its target
 * is the user type, which no role but admin may read.
 */
export const listBlogs = (token?: string | null) =>
  request<StrapiList<Blog>>(`/api/blogs?sort=createdAt:desc&${ALL}`, { token }).then(
    (r) => r.data
  );

/**
 * Fetched through the list endpoint rather than `findOne`, because posts are
 * addressed by slug in the UI and `findOne` takes a documentId. The list is
 * visibility-scoped server-side, so an unpublished post is simply absent.
 */
export const getBlogBySlug = (slug: string, token?: string | null) =>
  request<StrapiList<Blog>>(`/api/blogs?filters[slug][$eq]=${encodeURIComponent(slug)}`, {
    token,
  }).then((r) => r.data[0] ?? null);

export const createBlog = (
  data: { title: string; body: unknown; currentStatus?: 'draft' | 'published' },
  token: string
) =>
  request<StrapiSingle<Blog>>('/api/blogs', {
    token,
    method: 'POST',
    // Authorship comes from the token, and a new post starts as a draft.
    body: { data },
  }).then((r) => r.data);

export const publishBlog = (documentId: string, token: string) =>
  request<StrapiSingle<Blog>>(`/api/blogs/${documentId}/publish`, {
    token,
    method: 'PUT',
    body: {},
  }).then((r) => r.data);

/* -------------------------------------------------------------------------- */
/* Admin                                                                     */
/* -------------------------------------------------------------------------- */

export const getPlatformStats = (token: string) =>
  request<StrapiSingle<PlatformStats>>('/api/admin/stats', { token }).then((r) => r.data);
