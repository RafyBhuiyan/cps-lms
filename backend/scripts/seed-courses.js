'use strict';

/**
 * Three more demo courses — `npm run seed:courses` from the backend directory.
 *
 * Separate from `npm run seed` on purpose. That script owns the fixtures the
 * verification suite asserts against (one course, five lessons, one enrolment), so
 * growing it would mean re-tuning those assertions every time a course is added.
 * This one only ever adds catalog content and never touches users, enrolments or
 * progress.
 *
 * Plain JavaScript for the same reason as `seed.js`: the backend has no TS runner,
 * and `compileStrapi()` still compiles `src/` before booting.
 *
 * Safe to run repeatedly. Courses match on `slug`, lessons on
 * (course, sequenceOrder), and the quizzes — which have no natural key of their own
 * — are found through the relation that points at them, exactly as `seed.js` does.
 *
 * Deliberately creates **no enrolments**. Requesting one is the first feature a
 * demo should show, and `verify.sh` relies on student2 having no enrolment anywhere
 * and on student1 having exactly one.
 */

const { compileStrapi, createStrapi } = require('@strapi/strapi');

/** Content types here are all draft-and-publish; REST reads published. */
const PUBLISHED = { status: 'published' };

/** Drafts always exist, so querying them enumerates every document. */
const ANY_VERSION = { status: 'draft' };

/** The account that owns everything created here. Must already exist. */
const OWNER_EMAIL = 'instructor@demo.test';

const paragraph = (...texts) =>
  texts.map((text) => ({ type: 'paragraph', children: [{ type: 'text', text }] }));

/**
 * Each course gets one lesson quiz, one final quiz and one practice quiz, which is
 * every kind the app has: the lesson quiz gates its lesson, the final quiz is the
 * recorded grade, and the practice quiz is scored without being recorded.
 *
 * `gatedLesson` is a `sequenceOrder`, not an index — it is the lesson the lesson
 * quiz attaches to, and picking the second one means a demo can walk into the gate
 * without hitting it on the very first page.
 */
const COURSES = [
  {
    slug: 'cpp-fundamentals',
    title: 'C++ Fundamentals',
    description:
      'How C++ actually builds and runs: the compilation model, value semantics against references and pointers, RAII for resource safety, and the templates the standard library is made of.',
    lessons: [
      {
        title: 'Compilation, headers and the translation unit',
        content: paragraph(
          'A C++ program is compiled one translation unit at a time — a single .cpp file plus everything its #include directives pull in. The compiler never sees the other files, which is why a declaration has to be visible in every unit that uses it and why the definition may live in only one.',
          'That split is the whole reason headers exist. Get it wrong and the error surfaces at link time rather than compile time: "undefined reference" means the declaration was found and the definition never was.'
        ),
      },
      {
        title: 'Values, references and pointers',
        content: paragraph(
          'C++ copies by default. Passing an object by value copies it; passing by reference (T&) names the caller\'s object directly; passing a pointer (T*) hands over an address that may be null.',
          'Prefer const T& for anything larger than a machine word that you only need to read — it avoids the copy without giving the callee permission to modify. Reach for a pointer when absence is a legitimate state, because a reference can never be null.'
        ),
      },
      {
        title: 'RAII and the rule of zero',
        content: paragraph(
          'RAII ties a resource\'s lifetime to an object\'s scope: acquire in the constructor, release in the destructor. Because destructors run on every exit path, including exceptions, the resource cannot leak.',
          'The rule of zero follows from it — if your members are already RAII types such as std::vector, std::string or std::unique_ptr, you need no destructor, no copy constructor and no assignment operator of your own. The compiler-generated ones are correct.'
        ),
      },
      {
        title: 'Templates and the standard library',
        content: paragraph(
          'A template is compiled once per set of type arguments you actually use, so a std::vector<int> and a std::vector<std::string> share source but not generated code. Errors therefore appear at the point of instantiation, which is why template diagnostics name types you never wrote.',
          'Most of the standard library is templates over iterators rather than over containers. That is what lets std::sort work on a vector, a deque or a raw array without knowing which it was handed.'
        ),
      },
    ],
    gatedLesson: 2,
    lessonQuiz: [
      {
        questionText: 'What does passing an argument as `const T&` avoid?',
        options: [
          'Copying the object, while still forbidding modification',
          'Any chance of the argument being null',
          'The need to include a header',
          'Template instantiation',
        ],
        correctOptionIndex: 0,
      },
      {
        questionText: 'Why choose a pointer over a reference for a parameter?',
        options: [
          'Pointers are always faster',
          'Because a pointer can be null, so absence is representable',
          'References cannot be const',
          'Pointers avoid copying and references do not',
        ],
        correctOptionIndex: 1,
      },
    ],
    finalQuiz: [
      {
        questionText: 'What is a translation unit?',
        options: [
          'The whole program, after linking',
          'One .cpp file together with everything it includes',
          'A single function body',
          'A header file on its own',
        ],
        correctOptionIndex: 1,
      },
      {
        questionText: 'An "undefined reference" error at link time usually means what?',
        options: [
          'A declaration was missing',
          'A definition was never provided',
          'A header was included twice',
          'A template was instantiated wrongly',
        ],
        correctOptionIndex: 1,
      },
      {
        questionText: 'What makes RAII safe in the presence of exceptions?',
        options: [
          'Destructors run on every exit path from a scope',
          'Exceptions are disabled inside constructors',
          'The compiler inserts explicit free calls',
          'Nothing — RAII needs a try/catch to be safe',
        ],
        correctOptionIndex: 0,
      },
      {
        questionText: 'Under the rule of zero, when do you write your own destructor?',
        options: [
          'For every class that owns members',
          'Whenever the class has a constructor',
          'Only when managing a raw resource yourself',
          'Never, in any circumstance',
        ],
        correctOptionIndex: 2,
      },
    ],
    practiceQuiz: [
      {
        questionText: 'Does C++ pass function arguments by value by default?',
        options: ['Yes', 'No, by reference', 'Only for class types'],
        correctOptionIndex: 0,
      },
      {
        questionText: 'Can a reference be null?',
        options: ['Yes', 'No', 'Only if declared const'],
        correctOptionIndex: 1,
      },
      {
        questionText: 'Most standard-library algorithms are templated over what?',
        options: ['Containers', 'Iterators', 'Allocators'],
        correctOptionIndex: 1,
      },
    ],
  },
  {
    slug: 'java-fundamentals',
    title: 'Java Fundamentals',
    description:
      'The JVM and what "write once, run anywhere" really costs, then the parts of the language you use every day: objects and interfaces, the collections framework, generics, and exceptions.',
    lessons: [
      {
        title: 'The JVM, bytecode and the class path',
        content: paragraph(
          'javac does not produce machine code. It produces bytecode for the Java Virtual Machine, which interprets it and then JIT-compiles the hot paths to native code while the program runs. That is why a long-running Java process gets faster after it warms up.',
          'The class path is how the JVM finds classes at run time, and it is separate from what was on the compile-time path. A ClassNotFoundException is almost always a class path problem, not a compilation one.'
        ),
      },
      {
        title: 'Classes, interfaces and inheritance',
        content: paragraph(
          'A class may extend exactly one superclass but implement any number of interfaces. Interfaces are the right default for describing a capability, because a type can take on several of them without the fragility that deep inheritance chains bring.',
          'Prefer composition to inheritance when you only want to reuse an implementation: extending a class ties you to its internals, and its author is free to change them.'
        ),
      },
      {
        title: 'Collections and generics',
        content: paragraph(
          'List, Set, Map and Queue are interfaces; ArrayList, HashSet, HashMap and ArrayDeque are the implementations you will reach for most. Declare variables as the interface and construct the implementation, so the choice stays swappable.',
          'Generics are checked at compile time and then erased, so List<String> and List<Integer> are the same class at run time. That is why you cannot ask a list what its element type is, and why an unchecked-cast warning is worth reading rather than suppressing.'
        ),
      },
      {
        title: 'Exceptions and try-with-resources',
        content: paragraph(
          'A checked exception must be declared or handled; an unchecked one (a RuntimeException) need not be. Use checked exceptions for conditions a caller can reasonably recover from, and unchecked ones for programming errors.',
          'try-with-resources closes anything implementing AutoCloseable when the block exits, in reverse order of acquisition, even if the block threw. It is Java\'s answer to the same problem RAII solves in C++.'
        ),
      },
    ],
    gatedLesson: 2,
    lessonQuiz: [
      {
        questionText: 'How many superclasses may a Java class extend?',
        options: ['Any number', 'Exactly one', 'One, plus one per interface', 'None'],
        correctOptionIndex: 1,
      },
      {
        questionText: 'Why prefer composition over extending a class you only want to reuse?',
        options: [
          'Composition runs faster',
          'Inheritance ties you to internals its author may change',
          'Java forbids extending library classes',
          'Composition avoids needing interfaces',
        ],
        correctOptionIndex: 1,
      },
    ],
    finalQuiz: [
      {
        questionText: 'What does javac produce?',
        options: [
          'Native machine code',
          'JVM bytecode',
          'An intermediate C file',
          'A shared library',
        ],
        correctOptionIndex: 1,
      },
      {
        questionText: 'A ClassNotFoundException at run time points at what?',
        options: [
          'A compilation error',
          'A missing semicolon',
          'The class path used at run time',
          'An unchecked exception',
        ],
        correctOptionIndex: 2,
      },
      {
        questionText: 'Because generics are erased, at run time List<String> and List<Integer> are…',
        options: [
          'Different classes',
          'The same class',
          'Subclasses of one another',
          'Not classes at all',
        ],
        correctOptionIndex: 1,
      },
      {
        questionText: 'What does try-with-resources guarantee?',
        options: [
          'AutoCloseable resources are closed on every exit path',
          'Exceptions are converted to unchecked ones',
          'The block is retried on failure',
          'Resources are closed in acquisition order',
        ],
        correctOptionIndex: 0,
      },
    ],
    practiceQuiz: [
      {
        questionText: 'Is HashMap an interface or an implementation?',
        options: ['Interface', 'Implementation', 'Both'],
        correctOptionIndex: 1,
      },
      {
        questionText: 'Must a checked exception be declared or handled?',
        options: ['Yes', 'No', 'Only in libraries'],
        correctOptionIndex: 0,
      },
      {
        questionText: 'Does the JVM compile hot code paths to native code?',
        options: ['Yes, via the JIT', 'No, it always interprets', 'Only with a flag'],
        correctOptionIndex: 0,
      },
    ],
  },
  {
    slug: 'data-structures-and-algorithms',
    title: 'Data Structures and Algorithms',
    description:
      'Reasoning about cost rather than guessing at it: asymptotic analysis, the sequence and associative structures worth knowing, and the two graph traversals most problems reduce to.',
    lessons: [
      {
        title: 'Asymptotic cost, and what it hides',
        content: paragraph(
          'Big-O describes how work grows with input size, dropping constants and lower-order terms. O(n) beats O(n log n) eventually, but "eventually" can be larger than any input you will ever see — which is why an O(n^2) insertion sort is genuinely faster than quicksort on twenty elements.',
          'State which case you mean. A hash table lookup is O(1) on average and O(n) in the worst case, and a system that only holds up under the average is a system with a bad day ahead of it.'
        ),
      },
      {
        title: 'Arrays, dynamic arrays and linked lists',
        content: paragraph(
          'An array gives O(1) access by index because the address is arithmetic. A dynamic array keeps that while allowing growth: when it fills, it allocates a larger block and copies, and because it grows by a factor rather than a constant, appending is O(1) amortised.',
          'A linked list gives O(1) insertion once you hold the node, but finding that node is O(n) and every step is a pointer chase to somewhere the cache does not have. In practice a dynamic array wins far more often than the asymptotics suggest.'
        ),
      },
      {
        title: 'Hash tables and balanced trees',
        content: paragraph(
          'A hash table trades ordering for speed: average O(1) insert and lookup, no way to ask for the smallest key or iterate in order. Collisions are the whole design problem, handled by chaining or open addressing.',
          'A balanced binary search tree gives O(log n) for the same operations but keeps its keys ordered, so range queries and "next largest" cost nothing extra. Choose by whether you need order, not by which sounds faster.'
        ),
      },
      {
        title: 'Graph traversal: BFS and DFS',
        content: paragraph(
          'Both visit every reachable vertex once and differ only in which vertex they take next — BFS uses a queue, DFS uses a stack (often the call stack). Both are O(V + E) with an adjacency list.',
          'That choice decides what they are good for. BFS reaches vertices in order of edge count, so it finds shortest paths in an unweighted graph; DFS goes deep first, which is what makes it the basis of cycle detection and topological sort.'
        ),
      },
    ],
    gatedLesson: 2,
    lessonQuiz: [
      {
        questionText: 'Why is appending to a dynamic array O(1) amortised?',
        options: [
          'It never needs to reallocate',
          'It grows by a constant number of slots',
          'It grows by a factor, so copies are rare enough to average out',
          'Because access by index is O(1)',
        ],
        correctOptionIndex: 2,
      },
      {
        questionText: 'A linked list gives O(1) insertion — what is the catch?',
        options: [
          'Finding the node is O(n), and each step is a cache miss',
          'Insertion is actually O(log n)',
          'It cannot store objects',
          'It uses less memory than an array',
        ],
        correctOptionIndex: 0,
      },
    ],
    finalQuiz: [
      {
        questionText: 'What is the worst-case cost of a hash table lookup?',
        options: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'],
        correctOptionIndex: 2,
      },
      {
        questionText: 'Why might insertion sort beat quicksort on a small array?',
        options: [
          'Its asymptotic cost is lower',
          'Big-O drops the constants that dominate at small n',
          'Quicksort is not a comparison sort',
          'Insertion sort is O(log n)',
        ],
        correctOptionIndex: 1,
      },
      {
        questionText: 'You need lookups *and* in-order range queries. Which structure?',
        options: [
          'A hash table',
          'A balanced binary search tree',
          'A linked list',
          'A dynamic array',
        ],
        correctOptionIndex: 1,
      },
      {
        questionText: 'Which traversal finds shortest paths in an unweighted graph?',
        options: [
          'Depth-first search',
          'Breadth-first search',
          'Either, they are equivalent',
          'Neither, both need weights',
        ],
        correctOptionIndex: 1,
      },
    ],
    practiceQuiz: [
      {
        questionText: 'What data structure does BFS use to decide what to visit next?',
        options: ['A stack', 'A queue', 'A heap'],
        correctOptionIndex: 1,
      },
      {
        questionText: 'Cost of BFS or DFS over an adjacency list?',
        options: ['O(V + E)', 'O(V * E)', 'O(V log E)'],
        correctOptionIndex: 0,
      },
      {
        questionText: 'Does a hash table keep its keys in order?',
        options: ['Yes', 'No', 'Only on iteration'],
        correctOptionIndex: 1,
      },
    ],
  },
];

/* -------------------------------------------------------------------------- */

const docs = (uid) => strapi.documents(uid);

/** First match for a filter, or null. Reads drafts, so it sees every document. */
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
    console.log(`    = ${label}`);
    return updated;
  }

  const created = await docs(uid).create({ data, ...PUBLISHED });
  console.log(`    + ${label}`);
  return created;
};

/**
 * Creates or updates a quiz, given whatever already points at it.
 *
 * A quiz carries no title or slug, so there is no natural key to match on — the
 * relation pointing at it is its identity. Callers resolve that themselves and pass
 * the result in, which is also how `seed.js` handles it.
 */
const upsertQuiz = async (existing, questions, extraData, label) => {
  const data = { Question: questions, ...extraData };

  const quiz = existing
    ? await docs('api::quiz.quiz').update({
        documentId: existing.documentId,
        data,
        ...PUBLISHED,
      })
    : await docs('api::quiz.quiz').create({ data, ...PUBLISHED });

  console.log(`    ${existing ? '=' : '+'} ${label} (${questions.length} questions)`);
  return quiz;
};

/* -------------------------------------------------------------------------- */

const findOwner = async () => {
  const owner = await strapi.db.query('plugin::users-permissions.user').findOne({
    where: { email: OWNER_EMAIL },
    populate: ['role'],
  });

  if (!owner) {
    throw new Error(
      `No user ${OWNER_EMAIL}. Run "npm run seed" first — this script only adds ` +
        'catalog content and will not invent the account that owns it.'
    );
  }

  if (owner.role?.type !== 'instructor') {
    console.log(
      `! ${OWNER_EMAIL} is in role "${owner.role?.type ?? 'unknown'}", not "instructor". ` +
        'The courses will still be created and attributed, but that account cannot edit ' +
        'them over the API until its role is fixed.'
    );
  }

  return owner;
};

const seedCourse = async (spec, owner) => {
  console.log(`${spec.title}`);

  const course = await upsert(
    'api::course.course',
    { slug: spec.slug },
    {
      title: spec.title,
      slug: spec.slug,
      description: spec.description,
      creator: owner.id,
      instructors: [owner.id],
    },
    `course /${spec.slug}`
  );

  const lessons = [];

  for (const [index, lesson] of spec.lessons.entries()) {
    const sequenceOrder = index + 1;

    lessons.push(
      await upsert(
        'api::lesson.lesson',
        { course: { documentId: course.documentId }, sequenceOrder },
        {
          title: lesson.title,
          content: lesson.content,
          sequenceOrder,
          // `course` is the manyToOne side, so the lesson owns this relation.
          course: { documentId: course.documentId },
        },
        `lesson ${sequenceOrder}. ${lesson.title}`
      )
    );
  }

  // The lesson quiz. `quiz.lesson` is the owning side, so the link is written from
  // the quiz — and the existing one is found by reading it back off the lesson.
  const gated = lessons.find((lesson) => lesson.sequenceOrder === spec.gatedLesson);

  if (!gated) {
    throw new Error(`${spec.slug}: no lesson with sequenceOrder ${spec.gatedLesson}`);
  }

  const gatedWithQuiz = await docs('api::lesson.lesson').findOne({
    documentId: gated.documentId,
    populate: ['quiz'],
    ...ANY_VERSION,
  });

  await upsertQuiz(
    gatedWithQuiz?.quiz ?? null,
    spec.lessonQuiz,
    { lesson: { documentId: gated.documentId } },
    `lesson quiz gating "${gated.title}"`
  );

  // The final and practice quizzes, resolved the same way: through the relations
  // that point at them. `Course.final_quiz` is the owning side of that one, so the
  // link is written from the course afterwards; `parent_course` is owned by the quiz.
  const courseWithQuizzes = await docs('api::course.course').findOne({
    documentId: course.documentId,
    populate: ['final_quiz', 'practice_quizzes'],
    ...ANY_VERSION,
  });

  const finalQuiz = await upsertQuiz(
    courseWithQuizzes?.final_quiz ?? null,
    spec.finalQuiz,
    {},
    'final quiz'
  );

  await docs('api::course.course').update({
    documentId: course.documentId,
    data: { final_quiz: { documentId: finalQuiz.documentId } },
    ...PUBLISHED,
  });

  await upsertQuiz(
    (courseWithQuizzes?.practice_quizzes ?? [])[0] ?? null,
    spec.practiceQuiz,
    { parent_course: { documentId: course.documentId } },
    'practice quiz'
  );

  return course;
};

/* -------------------------------------------------------------------------- */

const main = async () => {
  const { appDir, distDir } = await compileStrapi();
  const app = createStrapi({ appDir, distDir });

  await app.load();

  try {
    const owner = await findOwner();
    console.log(`Owner: ${OWNER_EMAIL}\n`);

    for (const spec of COURSES) {
      await seedCourse(spec, owner);
    }

    console.log('\nDone. Nothing was enrolled — request enrolment from the frontend to');
    console.log('exercise the approval queue, then work a lesson to hit its quiz gate.');
  } finally {
    // As in `seed.js`: destroy() tears down the knex pool, and a connection still
    // checked out rejects with a bare `Error: aborted` from tarn. Everything above
    // is committed by then, so a shutdown race is noise rather than a failure.
    try {
      await app.destroy();
    } catch {
      /* ignore pool-shutdown races */
    }
  }
};

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
