'use strict';

/**
 * Demo data seeder — `npm run seed` from the backend directory.
 *
 * Written in plain JavaScript rather than TypeScript because the backend has no
 * TS runner installed (no tsx/ts-node), and adding one just to run a seed script
 * is not worth a dependency. `compileStrapi()` still compiles the project's own
 * TypeScript before booting, so the controllers and policies under `src/` are the
 * compiled ones.
 *
 * Safe to run repeatedly: every step below matches on a natural key and updates
 * in place rather than inserting a second copy.
 *
 * Deliberately does NOT create lesson-progress or quiz-result rows. Those are
 * what the quiz and progress endpoints are meant to produce, so seeding them
 * would mask a broken endpoint during verification. The student starts at 0%.
 */

const { compileStrapi, createStrapi } = require('@strapi/strapi');

const PASSWORD = 'Demo1234!';

/**
 * Enrollment, LessonProgress, Course, Lesson, Quiz and Blog are all
 * draft-and-publish content types. The Document Service defaults to *draft*,
 * so without an explicit status the seeded content would exist but be invisible
 * to the REST API, which defaults to published.
 */
const PUBLISHED = { status: 'published' };

/** Drafts always exist, so querying them enumerates every document. */
const ANY_VERSION = { status: 'draft' };

const COURSE_SLUG = 'intro-to-typescript';

const USERS = [
  { key: 'student', username: 'student', email: 'student@demo.test', roleType: 'authenticated' },
  { key: 'instructor', username: 'instructor', email: 'instructor@demo.test', roleType: 'instructor' },
  { key: 'contentManager', username: 'contentmanager', email: 'cm@demo.test', roleType: 'content_manager' },
  { key: 'admin', username: 'admin', email: 'admin@demo.test', roleType: 'admin' },
];

const paragraph = (text) => [{ type: 'paragraph', children: [{ type: 'text', text }] }];

const LESSONS = [
  {
    title: 'What TypeScript adds to JavaScript',
    sequenceOrder: 1,
    content: paragraph(
      'TypeScript is JavaScript with static types. It compiles away entirely — the types exist to catch mistakes before the code runs, and the browser never sees them.'
    ),
  },
  {
    title: 'Primitive types and inference',
    sequenceOrder: 2,
    content: paragraph(
      'string, number, boolean, null and undefined cover most annotations you will write. In practice you write far fewer than you expect, because the compiler infers a variable type from its initial value.'
    ),
  },
  {
    title: 'Interfaces and type aliases',
    sequenceOrder: 3,
    content: paragraph(
      'Both describe the shape of an object. Interfaces can be reopened and added to later; type aliases cannot, but they can express unions and intersections that interfaces cannot.'
    ),
  },
  {
    title: 'Unions, narrowing and null safety',
    sequenceOrder: 4,
    content: paragraph(
      'A union such as string | null says a value may be either. Under strictNullChecks the compiler will not let you use it until you have narrowed it — with a typeof check, a truthiness check, or an early return.'
    ),
  },
  {
    title: 'Generics',
    sequenceOrder: 5,
    content: paragraph(
      'A generic is a type parameter: it lets one function work over many types without giving up what it knows about them. Identity<T>(value: T): T returns exactly the type it was handed, unlike a version typed with any.'
    ),
  },
];

const FINAL_QUESTIONS = [
  {
    questionText: 'What happens to TypeScript type annotations when the code is compiled?',
    options: [
      'They are removed entirely',
      'They are converted to runtime checks',
      'They are kept as comments',
      'They are sent to the browser as metadata',
    ],
    correctOptionIndex: 0,
  },
  {
    questionText: 'Which can express a union of two types?',
    options: ['interface only', 'type alias only', 'Both interface and type alias', 'Neither'],
    correctOptionIndex: 1,
  },
  {
    questionText: 'Under strictNullChecks, what must you do before using a value of type string | null?',
    options: [
      'Cast it with the any type',
      'Nothing, it works as-is',
      'Narrow it, e.g. with a truthiness check',
      'Wrap it in a try/catch',
    ],
    correctOptionIndex: 2,
  },
  {
    questionText: 'Why prefer a generic <T> over any for a function that returns its argument?',
    options: [
      'It runs faster at runtime',
      'It preserves the caller’s type information',
      'It produces smaller compiled output',
      'There is no difference',
    ],
    correctOptionIndex: 1,
  },
];

const PRACTICE_QUESTIONS = [
  {
    questionText: 'Does TypeScript infer the type of `let count = 0`?',
    options: ['Yes, number', 'No, it stays any', 'Only with an annotation'],
    correctOptionIndex: 0,
  },
  {
    questionText: 'Which keyword declares a reopenable object shape?',
    options: ['type', 'interface', 'enum'],
    correctOptionIndex: 1,
  },
  {
    questionText: 'Is TypeScript a superset of JavaScript?',
    options: ['Yes', 'No', 'Only in strict mode'],
    correctOptionIndex: 0,
  },
];

/* -------------------------------------------------------------------------- */

const docs = (uid) => strapi.documents(uid);

/** First match for a filter, or null. */
const findOne = async (uid, filters) => {
  const [found] = await docs(uid).findMany({ filters, limit: 1, ...ANY_VERSION });
  return found ?? null;
};

const upsert = async (uid, filters, data, label) => {
  const existing = await findOne(uid, filters);

  if (existing) {
    const updated = await docs(uid).update({
      documentId: existing.documentId,
      data,
      ...PUBLISHED,
    });
    console.log(`  = ${label}`);
    return updated;
  }

  const created = await docs(uid).create({ data, ...PUBLISHED });
  console.log(`  + ${label}`);
  return created;
};

/* -------------------------------------------------------------------------- */

const seedUsers = async () => {
  const roles = await strapi.db.query('plugin::users-permissions.role').findMany({
    select: ['id', 'name', 'type'],
  });

  const roleByType = new Map(roles.map((role) => [role.type, role]));
  const missing = USERS.map((u) => u.roleType).filter((type) => !roleByType.has(type));

  if (missing.length > 0) {
    throw new Error(
      `Missing role(s): ${[...new Set(missing)].join(', ')}.\n` +
        `Roles present: ${roles.map((r) => `${r.type} ("${r.name}")`).join(', ')}.\n` +
        'Create the missing roles in Settings -> Users & Permissions -> Roles, then re-run.'
    );
  }

  console.log('Users');
  const created = {};

  for (const spec of USERS) {
    const role = roleByType.get(spec.roleType);

    // Users are not a draft/publish type, so no status here. The Document
    // Service hashes `password` attributes itself
    // (document-service/attributes/transforms.js:20), so the plaintext below is
    // never what lands in the database.
    const existing = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { email: spec.email },
    });

    const data = {
      username: spec.username,
      email: spec.email,
      password: PASSWORD,
      confirmed: true,
      blocked: false,
      provider: 'local',
      role: role.id,
    };

    if (existing) {
      created[spec.key] = await strapi.documents('plugin::users-permissions.user').update({
        documentId: existing.documentId,
        data,
        populate: ['role'],
      });
      console.log(`  = ${spec.email} (${spec.roleType})`);
    } else {
      created[spec.key] = await strapi.documents('plugin::users-permissions.user').create({
        data,
        populate: ['role'],
      });
      console.log(`  + ${spec.email} (${spec.roleType})`);
    }
  }

  return created;
};

const seedCourse = async (users) => {
  console.log('Course');

  const course = await upsert(
    'api::course.course',
    { slug: COURSE_SLUG },
    {
      title: 'Intro to TypeScript',
      slug: COURSE_SLUG,
      description:
        'A short, practical introduction to TypeScript: what it adds to JavaScript, the type system you will actually use day to day, and how to keep the compiler on your side.',
      creator: users.instructor.id,
      instructors: [users.instructor.id],
    },
    'Intro to TypeScript'
  );

  return course;
};

const seedLessons = async (course) => {
  console.log('Lessons');

  const lessons = [];

  for (const spec of LESSONS) {
    lessons.push(
      await upsert(
        'api::lesson.lesson',
        {
          course: { documentId: course.documentId },
          sequenceOrder: spec.sequenceOrder,
        },
        {
          ...spec,
          // `course` is the manyToOne side, so the lesson owns the relation.
          course: { documentId: course.documentId },
        },
        `${spec.sequenceOrder}. ${spec.title}`
      )
    );
  }

  return lessons;
};

const seedQuizzes = async (course) => {
  console.log('Quizzes');

  // A quiz has no title, so there is no natural key of its own — it is
  // identified purely by which course points at it.
  const courseWithQuiz = await strapi.documents('api::course.course').findOne({
    documentId: course.documentId,
    populate: ['final_quiz', 'practice_quizzes'],
    ...ANY_VERSION,
  });

  const existingFinal = courseWithQuiz?.final_quiz ?? null;

  const finalQuiz = existingFinal
    ? await strapi.documents('api::quiz.quiz').update({
        documentId: existingFinal.documentId,
        data: { Question: FINAL_QUESTIONS },
        ...PUBLISHED,
      })
    : await strapi.documents('api::quiz.quiz').create({
        data: { Question: FINAL_QUESTIONS },
        ...PUBLISHED,
      });

  console.log(
    `  ${existingFinal ? '=' : '+'} final quiz (${FINAL_QUESTIONS.length} questions)`
  );

  // `quiz.course` is the mappedBy side and so is not writable from the quiz.
  // The link has to be made from Course.final_quiz, which is the owning side.
  await strapi.documents('api::course.course').update({
    documentId: course.documentId,
    data: { final_quiz: { documentId: finalQuiz.documentId } },
    ...PUBLISHED,
  });

  const existingPractice = (courseWithQuiz?.practice_quizzes ?? [])[0] ?? null;

  // `parent_course` is the manyToOne side, so the quiz owns this one.
  const practiceQuiz = existingPractice
    ? await strapi.documents('api::quiz.quiz').update({
        documentId: existingPractice.documentId,
        data: {
          Question: PRACTICE_QUESTIONS,
          parent_course: { documentId: course.documentId },
        },
        ...PUBLISHED,
      })
    : await strapi.documents('api::quiz.quiz').create({
        data: {
          Question: PRACTICE_QUESTIONS,
          parent_course: { documentId: course.documentId },
        },
        ...PUBLISHED,
      });

  console.log(
    `  ${existingPractice ? '=' : '+'} practice quiz (${PRACTICE_QUESTIONS.length} questions)`
  );

  return { finalQuiz, practiceQuiz };
};

const seedEnrollment = async (course, users) => {
  console.log('Enrollment');

  await upsert(
    'api::enrollment.enrollment',
    {
      user: { id: users.student.id },
      course: { documentId: course.documentId },
    },
    {
      user: users.student.id,
      course: { documentId: course.documentId },
      enrolledAt: new Date().toISOString(),
    },
    `${users.student.email} -> Intro to TypeScript`
  );
};

const seedBlog = async (users) => {
  console.log('Blog');

  await upsert(
    'api::blog.blog',
    { slug: 'welcome-to-the-lms' },
    {
      title: 'Welcome to the LMS',
      slug: 'welcome-to-the-lms',
      body: paragraph(
        'This is a published demo post. Enrol in a course, work through the lessons, and take the final quiz to get a grade.'
      ),
      author: users.contentManager.id,
      currentStatus: 'published',
    },
    'Welcome to the LMS (published)'
  );

  await upsert(
    'api::blog.blog',
    { slug: 'unpublished-draft-post' },
    {
      title: 'Unpublished draft post',
      slug: 'unpublished-draft-post',
      body: paragraph(
        'This post stays in draft on purpose: it is what you check against to confirm that anonymous and student callers cannot see unpublished posts.'
      ),
      author: users.contentManager.id,
      currentStatus: 'draft',
    },
    'Unpublished draft post (draft — used to verify visibility rules)'
  );
};

/* -------------------------------------------------------------------------- */

const main = async () => {
  const { appDir, distDir } = await compileStrapi();
  const app = createStrapi({ appDir, distDir });

  await app.load();

  try {
    const users = await seedUsers();
    const course = await seedCourse(users);
    const lessons = await seedLessons(course);
    const quizzes = await seedQuizzes(course);
    await seedEnrollment(course, users);
    await seedBlog(users);

    console.log('\nSeed complete.');
    console.log(`  password for every demo account: ${PASSWORD}`);
    console.log(`  course documentId:        ${course.documentId}`);
    console.log(`  final quiz documentId:    ${quizzes.finalQuiz.documentId}`);
    console.log(`  practice quiz documentId: ${quizzes.practiceQuiz.documentId}`);
    console.log(`  lesson documentIds:       ${lessons.map((l) => l.documentId).join(', ')}`);
    console.log(
      '\nThe student has no progress yet — complete 3 of the 5 lessons to see 60%.'
    );
  } finally {
    // `destroy()` tears down the knex pool, which rejects any connection still
    // being checked out with a bare `Error: aborted` from tarn. Everything above
    // is already committed by then — the Document Service commits per call — so
    // a shutdown error is noise, not a failed seed, and must not be reported as
    // one.
    try {
      await app.destroy();
    } catch {
      /* ignore pool-shutdown races */
    }
  }
};

// Same reason as above: a stray rejection from the connection pool during
// shutdown should not make a successful seed look like a failure.
process.on('unhandledRejection', (error) => {
  if (error instanceof Error && error.message === 'aborted') {
    return;
  }

  console.error('\nSeed failed:', error);
  process.exit(1);
});

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\nSeed failed:', error.message);
    console.error(error);
    process.exit(1);
  });
