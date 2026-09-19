/**
 * Shapes returned by the Strapi API, as this app actually consumes them.
 *
 * Hand-written rather than generated: Strapi's generated types describe the
 * database schema, and what reaches the client is narrower — `private` fields are
 * stripped (`correctOptionIndex` most importantly), relations appear only when
 * populated, and the custom endpoints return their own shapes.
 */

/** The role `type` column, not the display name. `authenticated` is the student. */
export type RoleType = 'authenticated' | 'instructor' | 'content_manager' | 'admin';

export type Profile = {
  id: number;
  documentId: string | null;
  username: string | null;
  email: string | null;
  role: { name: string | null; type: RoleType | string | null };
};

/* -------------------------------------------------------------------------- */
/* Rich text                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Strapi's `blocks` editor format: a tree of nodes, where leaves carry `text`
 * plus formatting flags. Loose on purpose — an unknown node type should render as
 * its text rather than crash the page.
 */
export type BlockNode = {
  type?: string;
  text?: string;
  children?: BlockNode[];
  level?: number;
  format?: 'ordered' | 'unordered';
  url?: string;
  image?: { url?: string; alternativeText?: string | null };
  language?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  code?: boolean;
};

/* -------------------------------------------------------------------------- */
/* Content types                                                              */
/* -------------------------------------------------------------------------- */

export type Course = {
  id: number;
  documentId: string;
  title: string;
  slug: string | null;
  description: string | null;
  coverUrl: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  lessons?: Lesson[];
  final_quiz?: Quiz | null;
  practice_quizzes?: Quiz[];
};

export type Lesson = {
  id: number;
  documentId: string;
  title: string;
  content?: BlockNode[] | null;
  videoUrl: string | null;
  sequenceOrder: number | null;
  course?: Course | null;
  /** The quiz that gates this lesson's completion, if one is attached. */
  quiz?: Quiz | null;
};

/**
 * A quiz has no title of its own, and no flag saying whether it is a lesson,
 * final or practice quiz — which relation is set is what decides that. `course`
 * is the 1:1 back-reference from `Course.final_quiz`; `parent_course` is the N:1
 * from `Course.practice_quizzes`; `lesson` is the 1:1 from `Lesson.quiz`.
 */
export type Quiz = {
  id: number;
  documentId: string;
  Question?: Question[];
  course?: Course | null;
  parent_course?: Course | null;
  lesson?: Lesson | null;
};

/** `correctOptionIndex` is `private` in the schema and never reaches the client. */
export type Question = {
  id: number;
  questionText: string | null;
  options: unknown;
};

/**
 * `pending` and `rejected` grant no access; anything else — including a null left
 * over from before approval existed — counts as enrolled, matching `isEnrolled`
 * on the server.
 */
export type EnrollmentStatus = 'pending' | 'approved' | 'rejected';

export type Enrollment = {
  id: number;
  documentId: string;
  enrolledAt: string | null;
  /**
   * Named `current_status`, not `status`, because Strapi reserves `status` for the
   * draft/publish selector. Null on rows created before the field existed.
   */
  current_status: EnrollmentStatus | null;
  course?: Course | null;
};

/** Mirrors the server's `isEnrollmentActive`: null is treated as approved. */
export const isEnrollmentActive = (enrollment: Enrollment | null | undefined): boolean => {
  const status = enrollment?.current_status;
  return Boolean(enrollment) && status !== 'pending' && status !== 'rejected';
};

export type LessonProgress = {
  id: number;
  documentId: string;
  completed: boolean;
  completedAt: string | null;
  lesson?: Lesson | null;
};

export type QuizResult = {
  id: number;
  documentId: string;
  latestScore: number | null;
  updateTime: string | null;
  quiz?: Quiz | null;
};

export type Blog = {
  id: number;
  documentId: string;
  title: string;
  slug: string | null;
  body?: BlockNode[] | null;
  coverUrl: string | null;
  /**
   * Editorial state, separate from Strapi's own draft/publish. The API decides
   * visibility from this field, so a draft is simply absent for anyone but its
   * author and an admin.
   */
  currentStatus: 'draft' | 'published';
  createdAt: string;
  updatedAt: string;
};

/* -------------------------------------------------------------------------- */
/* Custom endpoints                                                           */
/* -------------------------------------------------------------------------- */

export type ProgressLesson = {
  documentId: string;
  title: string;
  sequenceOrder: number | null;
  completed: boolean;
  /** The attached quiz, if any. */
  quizId: string | null;
  /** True only when that quiz has questions — an empty one gates nothing. */
  quizRequired: boolean;
  /** The latest mark on it, or null if never attempted. */
  quizScore: number | null;
  /** True when nothing gates the lesson, so `quizRequired && !quizPassed` is the lock. */
  quizPassed: boolean;
};

export type FinalQuizGrade = {
  quizId: string;
  attempted: boolean;
  latestScore: number | null;
  updateTime: string | null;
};

/** `GET /api/courses/:id/progress` */
export type CourseProgress = {
  courseId: string;
  userId: number;
  completedLessons: number;
  totalLessons: number;
  progressPercent: number;
  /** The server's `QUIZ_PASS_SCORE`, so the pass mark is never hardcoded here. */
  quizPassMark: number;
  lessons: ProgressLesson[];
  finalQuiz: FinalQuizGrade | null;
};

/** `POST /api/lessons/:id/complete` */
export type LessonCompletion = {
  lessonId: string;
  courseId: string;
  completed: boolean;
  progress: Omit<CourseProgress, 'courseId' | 'userId' | 'finalQuiz'>;
};

/** `POST /api/quizzes/:id/submit` — graded entirely on the server. */
export type QuizSubmission = {
  quizId: string;
  courseId: string;
  isFinal: boolean;
  /** True when the quiz gates a lesson, in which case `passed` decides that gate. */
  isLesson: boolean;
  lessonId: string | null;
  /** False for practice quizzes: scored on screen, nothing stored. */
  recorded: boolean;
  score: number;
  /** The mark a lesson quiz must reach, from `QUIZ_PASS_SCORE` on the server. */
  passMark: number;
  passed: boolean;
  correctCount: number;
  totalQuestions: number;
  results: { questionIndex: number; correct: boolean }[];
};

/** A student waiting on a decision, from `students-progress`. */
export type EnrollmentRequest = {
  enrollmentId: string;
  userId: number;
  username: string;
  email: string;
  currentStatus: EnrollmentStatus;
  requestedAt: string | null;
};

/** `GET /api/courses/:id/students-progress` */
export type StudentsProgress = {
  courseId: string;
  totalStudents: number;
  students: {
    userId: number;
    username: string;
    email: string;
    enrollmentId: string;
    completedLessons: number;
    totalLessons: number;
    progressPercent: number;
    lessons: ProgressLesson[];
    finalQuiz: FinalQuizGrade | null;
  }[];
  /**
   * Pending *and* rejected requests. Served from here because it needs student
   * names, which `GET /api/enrollments?populate[user]` cannot supply — see the
   * note at the top of `api.ts`.
   */
  pendingRequests: EnrollmentRequest[];
};

/** `POST /api/enrollments/:id/{approve,reject,reopen}` */
export type EnrollmentDecision = {
  documentId: string;
  current_status: EnrollmentStatus;
  courseId: string;
  userId: number | null;
  updatedAt: string | null;
};

/** `GET /api/admin/stats` */
export type PlatformStats = {
  totalUsers: number;
  usersByRole: { role: string; name: string; users: number }[];
  totalCourses: number;
  totalLessons: number;
  totalEnrollments: number;
  totalQuizzes: number;
  totalBlogs: number;
};

/**
 * One account, as the admin dashboard sees it. Deliberately narrow — the endpoint
 * that returns it names its columns explicitly, so nothing else about a user is
 * available here even by accident.
 */
export type AdminUser = {
  /** The numeric id, which is what `setUserRole` addresses. Users have no documentId in this payload. */
  id: number;
  username: string | null;
  email: string | null;
  confirmed: boolean;
  blocked: boolean;
  createdAt: string | null;
  role: { name: string | null; type: RoleType | string | null } | null;
};

/**
 * `GET /api/admin/users` — accounts and the assignable roles together, so the
 * dashboard can render its role selects without a second request. `total` is the
 * unpaginated count, so a truncated page can say so.
 */
export type AdminDirectory = {
  users: AdminUser[];
  roles: { id: number; name: string; type: RoleType | string }[];
  total: number;
  page: number;
  pageSize: number;
};

/* -------------------------------------------------------------------------- */
/* Quiz authoring                                                             */
/* -------------------------------------------------------------------------- */

/**
 * A question as an author writes it — including the answer key, which is the whole
 * point. `correctOptionIndex` is `private` in the schema, so it is *writable* but
 * unreadable: it comes back only from `GET /api/quizzes/:id/manage`, never from an
 * ordinary read.
 */
export type QuizQuestionDraft = {
  questionText: string;
  options: string[];
  /** An index into `options`. Null only for a legacy question with no key recorded. */
  correctOptionIndex: number | null;
};

/**
 * `GET /api/quizzes/:id/manage` — a quiz with its answer key, for someone allowed
 * to change it. The three booleans say which kind it is; a quiz carries no type
 * flag of its own, only the relation that happens to be set.
 */
export type ManagedQuiz = {
  documentId: string;
  questions: QuizQuestionDraft[];
  course: { documentId: string; title: string | null } | null;
  lesson: { documentId: string; title: string | null } | null;
  isFinal: boolean;
  isLesson: boolean;
  isPractice: boolean;
};

/** `PUT /api/courses/:id/final-quiz` */
export type FinalQuizAssignment = {
  courseId: string;
  finalQuizId: string | null;
  /**
   * The quiz that used to hold the slot, if one did. It is demoted to a practice
   * quiz rather than detached — a quiz with no relation at all cannot be reached,
   * edited or deleted over REST.
   */
  demotedToPractice: string | null;
};
