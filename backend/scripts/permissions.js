'use strict';

/**
 * Grants the role permissions this LMS needs — `npm run permissions`.
 *
 * Why this exists as a script rather than a dashboard checklist: the custom
 * routes (quiz submit, lesson complete, course progress, blog publish, admin
 * stats) each create a *new* permission action, and a route with no permission
 * granted returns 403 no matter how correct the controller is. That is roughly
 * thirty checkboxes across five roles, which has to be repeated by hand on every
 * environment — including production — and is exactly the sort of step that gets
 * half-done.
 *
 * ADDITIVE ONLY. It never revokes a grant, so it cannot undo anything configured
 * in the dashboard; re-running it is a no-op once everything is present.
 *
 * Run it after any change to routes or controllers.
 */

const { compileStrapi, createStrapi } = require('@strapi/strapi');

const READ_CONTENT = [
  'api::course.course.find',
  'api::course.course.findOne',
  'api::lesson.lesson.find',
  'api::lesson.lesson.findOne',
  'api::quiz.quiz.find',
  'api::quiz.quiz.findOne',
  'api::blog.blog.find',
  'api::blog.blog.findOne',
  // How the frontend learns who it is talking for. Every logged-in role needs it;
  // `public` deliberately does not, since it answers 401 with no token anyway.
  'api::profile.profile.me',
];

const MANAGE_CONTENT = [
  'api::course.course.create',
  'api::course.course.update',
  'api::course.course.delete',
  'api::lesson.lesson.create',
  'api::lesson.lesson.update',
  'api::lesson.lesson.delete',
  'api::quiz.quiz.create',
  'api::quiz.quiz.update',
  'api::quiz.quiz.delete',
];

/**
 * Deciding on an enrolment request. Ownership is enforced in the controller — an
 * instructor holding these may still only act on their own courses.
 */
const DECIDE_ENROLLMENT = [
  'api::enrollment.enrollment.approve',
  'api::enrollment.enrollment.reject',
  'api::enrollment.enrollment.reopen',
];

/**
 * What each role may call. Ownership is *not* expressed here — the policies and
 * controllers narrow these further (an instructor holding `course.update` may
 * still only update their own courses).
 */
const MATRIX = {
  public: ['api::course.course.find', 'api::course.course.findOne', 'api::blog.blog.find', 'api::blog.blog.findOne'],

  // Student.
  authenticated: [
    ...READ_CONTENT,
    'api::enrollment.enrollment.create',
    'api::enrollment.enrollment.find',
    'api::enrollment.enrollment.findOne',
    'api::lesson-progress.lesson-progress.find',
    'api::lesson-progress.lesson-progress.findOne',
    'api::quiz-result.quiz-result.find',
    'api::quiz-result.quiz-result.findOne',
    // The three custom endpoints a student actually drives.
    'api::quiz.quiz.submit',
    'api::lesson.lesson.complete',
    'api::course.course.progress',
  ],

  instructor: [
    ...READ_CONTENT,
    ...MANAGE_CONTENT,
    ...DECIDE_ENROLLMENT,
    'api::enrollment.enrollment.find',
    'api::enrollment.enrollment.findOne',
    'api::lesson-progress.lesson-progress.find',
    'api::lesson-progress.lesson-progress.findOne',
    // Without quiz-result.find an instructor cannot see any grades at all.
    'api::quiz-result.quiz-result.find',
    'api::quiz-result.quiz-result.findOne',
    'api::course.course.progress',
    'api::course.course.studentsProgress',
  ],

  content_manager: [
    ...READ_CONTENT,
    ...MANAGE_CONTENT,
    ...DECIDE_ENROLLMENT,
    'api::blog.blog.create',
    'api::blog.blog.update',
    'api::blog.blog.delete',
    'api::blog.blog.publish',
    'api::enrollment.enrollment.find',
    'api::enrollment.enrollment.findOne',
    'api::lesson-progress.lesson-progress.find',
    'api::lesson-progress.lesson-progress.findOne',
    'api::quiz-result.quiz-result.find',
    'api::quiz-result.quiz-result.findOne',
    'api::course.course.progress',
    'api::course.course.studentsProgress',
  ],

  admin: [
    ...READ_CONTENT,
    ...MANAGE_CONTENT,
    ...DECIDE_ENROLLMENT,
    'api::blog.blog.create',
    'api::blog.blog.update',
    'api::blog.blog.delete',
    'api::blog.blog.publish',
    'api::enrollment.enrollment.find',
    'api::enrollment.enrollment.findOne',
    'api::enrollment.enrollment.create',
    'api::enrollment.enrollment.update',
    'api::enrollment.enrollment.delete',
    'api::lesson-progress.lesson-progress.find',
    'api::lesson-progress.lesson-progress.findOne',
    'api::quiz-result.quiz-result.find',
    'api::quiz-result.quiz-result.findOne',
    'api::quiz-result.quiz-result.delete',
    'api::course.course.progress',
    'api::course.course.studentsProgress',
    'api::course.course.stats',
  ],
};

/**
 * Every `api::<api>.<controller>.<action>` the running app exposes.
 *
 * Worth checking against, because `syncPermissions` deletes any permission row
 * whose action is not a real controller method
 * (services/users-permissions.js:183-190). A typo here would look like it worked
 * and then quietly vanish on the next boot.
 */
const availableActions = () => {
  const actions = new Set();

  for (const [apiName, api] of Object.entries(strapi.apis ?? {})) {
    for (const [controllerName, controller] of Object.entries(api.controllers ?? {})) {
      for (const actionName of Object.keys(controller ?? {})) {
        actions.add(`api::${apiName}.${controllerName}.${actionName}`);
      }
    }
  }

  return actions;
};

const main = async () => {
  const { appDir, distDir } = await compileStrapi();
  const app = createStrapi({ appDir, distDir });

  await app.load();

  try {
    const known = availableActions();

    const roles = await strapi.db.query('plugin::users-permissions.role').findMany({
      select: ['id', 'name', 'type'],
    });
    const roleByType = new Map(roles.map((role) => [role.type, role]));

    const unknown = [...new Set(Object.values(MATRIX).flat())].filter((a) => !known.has(a));

    if (unknown.length > 0) {
      throw new Error(
        `These actions do not exist in the running app:\n  ${unknown.join('\n  ')}\n` +
          'Check the controller method names and route handlers.'
      );
    }

    let granted = 0;

    for (const [roleType, actions] of Object.entries(MATRIX)) {
      const role = roleByType.get(roleType);

      if (!role) {
        console.log(`! role "${roleType}" does not exist — skipped`);
        continue;
      }

      const existing = await strapi.db.query('plugin::users-permissions.permission').findMany({
        where: { role: role.id },
        select: ['action'],
      });
      const have = new Set(existing.map((permission) => permission.action));

      const missing = [...new Set(actions)].filter((action) => !have.has(action));

      console.log(`${role.name} (${roleType}) — ${have.size} granted, ${missing.length} to add`);

      for (const action of missing) {
        await strapi.db.query('plugin::users-permissions.permission').create({
          data: { action, role: role.id },
        });
        console.log(`  + ${action}`);
        granted += 1;
      }
    }

    console.log(
      granted === 0
        ? '\nNothing to do — every permission in the matrix is already granted.'
        : `\nGranted ${granted} permission(s). Nothing was revoked.`
    );
  } finally {
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

  console.error('\nFailed:', error);
  process.exit(1);
});

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\nFailed:', error.message);
    process.exit(1);
  });
