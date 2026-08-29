import type { UID } from '@strapi/strapi';
import type { Context } from 'koa';
import { isInstructor, isPrivileged, type AuthUser } from './roles';

/**
 * Shared LMS queries.
 *
 * These live in one place because the draft/publish rule below is easy to get
 * wrong and needs to hold in six different controllers.
 */

/**
 * Enrollment, LessonProgress and QuizResult all have `draftAndPublish: true`.
 * That means `documents().create()` produces a *draft*, while
 * `documents().findMany()` returns *published* rows by default — so writing a
 * progress row and reading it back would silently report 0%.
 *
 * Passing `status: 'published'` makes create/update publish immediately
 * (repository.js:288 and :391) and makes reads select the published row.
 */
export const PUBLISHED = { status: 'published' as const } as const;

/**
 * Every Strapi 5 document keeps its draft row for the life of the document —
 * `publish()` only ever replaces the *published* counterpart
 * (repository.js:406-433). So querying drafts enumerates all documents,
 * published or not, which is what an existence check needs. Checking published
 * rows only would miss a draft-only row (one created in the admin panel, say)
 * and create a second document for the same pair.
 */
export const ANY_VERSION = { status: 'draft' as const } as const;

/**
 * Read everything; -1 becomes "no LIMIT clause" (convert-query-params.js:159).
 * Worth being explicit about: the REST layer caps at `maxLimit: 100`
 * (config/api.ts), so an aggregate built from a default-limited read would
 * silently stop counting at 100 rows.
 */
export const NO_LIMIT = -1;

export type ProgressLesson = {
  documentId: string;
  title: string;
  sequenceOrder: number | null;
  completed: boolean;
};

export type CourseProgress = {
  completedLessons: number;
  totalLessons: number;
  progressPercent: number;
  lessons: ProgressLesson[];
};

/**
 * `strapi.documents()` is generic per-UID and its `data` types are strict; these
 * helpers are deliberately UID-agnostic, so the repository handle is widened
 * once here rather than fighting the generics at every call site.
 */
const docs = (uid: UID.ContentType) => strapi.documents(uid as never) as any;

/* -------------------------------------------------------------------------- */
/* Slugs                                                                      */
/* -------------------------------------------------------------------------- */

/** A uid field must be URL-safe and unique, so this is what it is reduced to. */
export const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    // Any run of non-alphanumerics becomes a single dash; `u` keeps this working
    // for non-Latin titles rather than reducing them to an empty string.
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

/**
 * A slug derived from `title` that no document of `uid` is using yet.
 *
 * Needed because the content API does not fill uid fields at all: that generation
 * lives in the admin panel's content-manager plugin (`services/uid.js`), so a row
 * created over REST is saved with `slug: null`. For the blog that is fatal — posts
 * are addressed by slug, so the post would be unreachable at its own URL — and for
 * a course it means content created from the instructor dashboard is inconsistent
 * with everything seeded or authored in the admin panel.
 */
export const uniqueSlug = async (
  uid: UID.ContentType,
  title: string,
  fallback = 'item'
): Promise<string> => {
  const base = slugify(title) || fallback;

  for (let attempt = 1; attempt <= 50; attempt += 1) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`;

    const [taken] = await docs(uid).findMany({
      filters: { slug: candidate },
      limit: 1,
      // Draft rows hold the uid too, so a published-only check would miss a
      // collision and the unique index would reject the insert.
      ...ANY_VERSION,
    });

    if (!taken) {
      return candidate;
    }
  }

  // 50 rows sharing a title is not a case worth another query for.
  return `${base}-${Math.round(Math.random() * 1e6)}`;
};

/* -------------------------------------------------------------------------- */
/* Quizzes                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A quiz reaches its course by one of two relations: `course` (the 1:1 set from
 * `Course.final_quiz`) or `parent_course` (the N:1 set from
 * `Course.practice_quizzes`). Which one is populated is what makes a quiz final
 * or practice — there is no boolean flag on the quiz itself.
 */
export const resolveQuizCourse = async (quizDocumentId: string) => {
  const quiz = await docs('api::quiz.quiz').findOne({
    documentId: quizDocumentId,
    // correctOptionIndex is `private`, which only strips it from REST output —
    // the Document Service still returns it, which is what makes server-side
    // grading possible.
    populate: ['Question', 'course', 'parent_course'],
    ...PUBLISHED,
  });

  if (!quiz) {
    return { quiz: null, course: null, isFinal: false };
  }

  const isFinal = Boolean(quiz.course);
  return { quiz, course: quiz.course ?? quiz.parent_course ?? null, isFinal };
};

/* -------------------------------------------------------------------------- */
/* Enrollment                                                                 */
/* -------------------------------------------------------------------------- */

export const findEnrollment = async (userId: number, courseDocumentId: string) => {
  const [enrollment] = await docs('api::enrollment.enrollment').findMany({
    filters: {
      user: { id: userId },
      course: { documentId: courseDocumentId },
    },
    limit: 1,
    ...ANY_VERSION,
  });

  return enrollment ?? null;
};

export const isEnrolled = async (userId: number, courseDocumentId: string) =>
  Boolean(await findEnrollment(userId, courseDocumentId));

/* -------------------------------------------------------------------------- */
/* Course ownership                                                           */
/* -------------------------------------------------------------------------- */

/** Loads a course with the relations `canManageCourse` needs. */
export const loadCourseForOwnership = async (courseDocumentId: string) =>
  docs('api::course.course').findOne({
    documentId: courseDocumentId,
    populate: ['creator', 'instructors'],
    ...ANY_VERSION,
  });

/**
 * admin and content_manager manage any course; an instructor manages only
 * courses they created or are explicitly assigned to teach.
 *
 * `course` must be populated with `creator` and `instructors` — use
 * `loadCourseForOwnership`.
 */
export const canManageCourse = (user: AuthUser, course: any): boolean => {
  if (!user || !course) {
    return false;
  }

  if (isPrivileged(user)) {
    return true;
  }

  if (!isInstructor(user)) {
    return false;
  }

  if (course.creator?.id === user.id) {
    return true;
  }

  const instructors = Array.isArray(course.instructors) ? course.instructors : [];
  return instructors.some((instructor: any) => instructor?.id === user.id);
};

/** `canManageCourse` when all you hold is the documentId. */
export const canManageCourseById = async (
  user: AuthUser,
  courseDocumentId: string
): Promise<boolean> => {
  const course = await loadCourseForOwnership(courseDocumentId);

  if (!course) {
    return false;
  }

  return canManageCourse(user, course);
};

/**
 * Pulls a course documentId out of a relation field in a request body.
 *
 * Strapi 5 accepts several shapes for the same relation — a bare documentId,
 * `{ documentId }`, or the longhand `{ connect: [...] }` / `{ set: [...] }`. The
 * create-time ownership policies deny when they cannot resolve a course, so
 * understanding only the shorthand would reject perfectly valid longhand
 * payloads. All three are handled here instead of in each policy.
 */
export const courseRefFromBody = (body: any, field: string): string | null => {
  const ref = body?.data?.[field];

  if (typeof ref === 'string' && ref) {
    return ref;
  }

  if (typeof ref?.documentId === 'string' && ref.documentId) {
    return ref.documentId;
  }

  const list = ref?.connect ?? ref?.set;

  if (Array.isArray(list) && list.length > 0) {
    const [first] = list;

    if (typeof first === 'string' && first) {
      return first;
    }

    if (typeof first?.documentId === 'string' && first.documentId) {
      return first.documentId;
    }
  }

  return null;
};

/** documentIds of every course the given instructor may manage. */
export const manageableCourseIds = async (user: AuthUser): Promise<string[]> => {
  if (!user) {
    return [];
  }

  const courses = await docs('api::course.course').findMany({
    filters: {
      $or: [{ creator: { id: user.id } }, { instructors: { id: user.id } }],
    },
    fields: ['title'],
    limit: NO_LIMIT,
    ...ANY_VERSION,
  });

  return courses.map((course: any) => course.documentId);
};

/* -------------------------------------------------------------------------- */
/* Progress                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The single source of truth for "how far through this course is this student".
 * Returns the three numbers the spec asks for plus per-lesson flags, so a
 * lesson list can be rendered from one call.
 */
export const computeCourseProgress = async (
  userId: number,
  courseDocumentId: string
): Promise<CourseProgress> => {
  const lessons = await docs('api::lesson.lesson').findMany({
    filters: { course: { documentId: courseDocumentId } },
    fields: ['title', 'sequenceOrder'],
    sort: ['sequenceOrder:asc', 'createdAt:asc'],
    limit: NO_LIMIT,
    ...PUBLISHED,
  });

  const totalLessons = lessons.length;

  if (totalLessons === 0) {
    return { completedLessons: 0, totalLessons: 0, progressPercent: 0, lessons: [] };
  }

  const completedRows = await docs('api::lesson-progress.lesson-progress').findMany({
    filters: {
      completed: true,
      user: { id: userId },
      lesson: { documentId: { $in: lessons.map((lesson: any) => lesson.documentId) } },
    },
    populate: ['lesson'],
    limit: NO_LIMIT,
    // Tracking rows are read with ANY_VERSION, not PUBLISHED: the whole point of
    // this file's draft/publish care is that a progress row must never be
    // silently invisible. Lessons above stay PUBLISHED, because unpublished
    // course content genuinely should not count toward a total.
    ...ANY_VERSION,
  });

  // A Set, not a row count: if the upsert ever raced and produced two rows for
  // one lesson, a count would report more lessons completed than exist.
  const completedLessonIds = new Set<string>(
    completedRows
      .map((row: any) => row.lesson?.documentId)
      .filter((id: unknown): id is string => typeof id === 'string')
  );

  const completedLessons = completedLessonIds.size;

  return {
    completedLessons,
    totalLessons,
    progressPercent: Math.round((completedLessons / totalLessons) * 100),
    lessons: lessons.map((lesson: any) => ({
      documentId: lesson.documentId,
      title: lesson.title,
      sequenceOrder: lesson.sequenceOrder ?? null,
      completed: completedLessonIds.has(lesson.documentId),
    })),
  };
};

/* -------------------------------------------------------------------------- */
/* Query scoping                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Intersects a mandatory scope with whatever filters the client sent, then hands
 * the query back to the core `find` controller.
 *
 * The outer `$and` is the point. Assigning `ctx.query.filters.user` instead
 * would look equivalent but is escapable — a client can nest filters freely
 * (`filters[$or][0][user][id]=<someone-else>`), and a top-level merge would sit
 * *inside* that `$or` rather than constraining it. An outer `$and` cannot be
 * escaped: the scope is always intersected with the client's query, so the worst
 * a hostile filter can do is return fewer of the caller's own rows.
 */
export const scopeQuery = (ctx: Context, scope: Record<string, any>) => {
  const query = ctx.query as Record<string, any>;
  query.filters = query.filters ? { $and: [scope, query.filters] } : scope;
};

/**
 * A filter no row can satisfy, for when a caller is entitled to nothing.
 *
 * `{ $in: [] }` cannot be used for this. The content-API sanitizer deletes empty
 * arrays and empty plain objects from filters outright
 * (sanitize/sanitizers.js:61-67), so an empty allowlist is not a filter that
 * matches nothing — it is *no filter at all*, and the core controller then
 * returns every row in the table to the one caller entitled to none. That is a
 * fail-open default and it was observed: a student who owned no progress rows
 * saw all of another student's.
 *
 * `documentId` is NOT NULL on every row, so `$null: true` selects nothing, and it
 * survives sanitization because `true` is neither an empty array nor an empty
 * object.
 *
 * Note this hazard is specific to the REST layer. The Document Service honours
 * `$in: []` correctly, including nested through relations and inside `$or`
 * (verified), which is why the scope objects the controllers build may still
 * contain empty allowlists.
 */
const MATCHES_NOTHING = { documentId: { $null: true } } as const;

/**
 * Restricts a core `find` to the documents a scope selects, expressed as an
 * opaque documentId allowlist.
 *
 * The indirection is not optional. Injecting a relation filter directly — say
 * `{ user: { id: 7 } }` — is rejected with `400 Invalid key user` unless the
 * *caller's* role holds `find` on the relation's target content type
 * (validate/visitors/throw-restricted-relations.js). Scoping a student's own
 * progress goes through `user`, whose target is the users-permissions user, and
 * granting students `plugin::users-permissions.user.find` to satisfy the
 * validator would let them enumerate every account on the platform — a far worse
 * problem than the one being solved.
 *
 * So the scope is resolved here with the Document Service, which performs no
 * permission validation, and only the resulting ids are handed to the core
 * controller. Pagination, sorting, sanitization and any client filters continue
 * to work untouched, and the scope no longer depends on what the caller happens
 * to be allowed to read.
 */
export const scopeQueryToDocuments = async (
  ctx: Context,
  uid: UID.ContentType,
  scope: Record<string, any>
) => {
  const rows = await docs(uid).findMany({
    filters: scope,
    fields: ['id'],
    limit: NO_LIMIT,
    ...ANY_VERSION,
  });

  const documentIds = rows.map((row: any) => row.documentId);

  scopeQuery(
    ctx,
    documentIds.length > 0 ? { documentId: { $in: documentIds } } : MATCHES_NOTHING
  );
};

/**
 * Scope matching quizzes belonging to any of the given courses, by either of the
 * two course relations.
 */
export const quizzesOfCourses = (courseDocumentIds: string[]) => ({
  $or: [
    { course: { documentId: { $in: courseDocumentIds } } },
    { parent_course: { documentId: { $in: courseDocumentIds } } },
  ],
});

/* -------------------------------------------------------------------------- */
/* Upsert                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Stamps the owning account on a row that was just created through the REST
 * layer — `Course.creator`, `Blog.author`, `Enrollment.user`.
 *
 * It cannot be done in the request body, which is the obvious way and does not
 * work. All three fields point at `plugin::users-permissions.user`, and the
 * content API rejects any payload key that reaches a type the caller cannot
 * `find` (`@strapi/utils` validate/visitors/throw-restricted-relations.js) with
 * `400 ValidationError: Invalid key <field>`. That is every role in this project:
 * granting `user.find` to make the payload legal would let any logged-in account
 * enumerate the user table, which is a far worse trade than a second write.
 *
 * The Document Service is not subject to content-API validation, so ownership is
 * attached here instead. `PUBLISHED` matters: a REST create publishes the
 * document, ownership checks read the draft version, and readers see the
 * published one — writing only the draft would leave the published row ownerless.
 */
export const attachOwner = async (
  uid: UID.ContentType,
  documentId: string,
  field: 'creator' | 'author' | 'user',
  userId: number
) => docs(uid).update({ documentId, data: { [field]: userId }, ...PUBLISHED });

/**
 * Create-or-update by filter, standing in for the composite unique constraints
 * Strapi cannot declare — one LessonProgress per (user, lesson), one QuizResult
 * per (user, quiz), one Enrollment per (user, course).
 *
 * Not atomic: two simultaneous identical writes could both insert. Callers that
 * aggregate (see `computeCourseProgress`) are written to tolerate that.
 */
export const upsertOne = async (
  uid: UID.ContentType,
  filters: Record<string, any>,
  data: Record<string, any>
) => {
  const repo = docs(uid);

  const [existing] = await repo.findMany({ filters, limit: 1, ...ANY_VERSION });

  if (existing) {
    return {
      created: false,
      document: await repo.update({ documentId: existing.documentId, data, ...PUBLISHED }),
    };
  }

  return { created: true, document: await repo.create({ data, ...PUBLISHED }) };
};
