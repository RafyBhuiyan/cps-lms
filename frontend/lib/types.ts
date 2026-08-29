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
};

/**
 * A quiz has no title of its own, and no flag saying whether it is the final or a
 * practice quiz — which of the two course relations is set is what decides that.
 * `course` is the 1:1 back-reference from `Course.final_quiz`; `parent_course` is
 * the N:1 from `Course.practice_quizzes`.
 */
export type Quiz = {
  id: number;
  documentId: string;
  Question?: Question[];
  course?: Course | null;
  parent_course?: Course | null;
};

/** `correctOptionIndex` is `private` in the schema and never reaches the client. */
export type Question = {
  id: number;
  questionText: string | null;
  options: unknown;
};

export type Enrollment = {
  id: number;
  documentId: string;
  enrolledAt: string | null;
  course?: Course | null;
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
  /** False for practice quizzes: scored on screen, nothing stored. */
  recorded: boolean;
  score: number;
  correctCount: number;
  totalQuestions: number;
  results: { questionIndex: number; correct: boolean }[];
};

/** `GET /api/courses/:id/students-progress` */
export type StudentsProgress = {
  courseId: string;
  totalStudents: number;
  students: {
    userId: number;
    username: string;
    email: string;
    completedLessons: number;
    totalLessons: number;
    progressPercent: number;
    lessons: ProgressLesson[];
    finalQuiz: FinalQuizGrade | null;
  }[];
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
