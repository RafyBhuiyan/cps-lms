'use strict';

/**
 * One-time backfill of `Enrollment.current_status` — `npm run backfill:enrollments`.
 *
 * Approval is a new requirement. Every enrollment created before the
 * `current_status` field existed has no status at all, and the students behind
 * those rows are already part-way through their courses. Leaving them null and
 * requiring approval would lock a live class out; this sets them to `approved` so
 * the new gate applies only to requests made from now on.
 *
 * Run it once per environment, after deploying the code that adds the field.
 * Production needs the same env prefix as `npm run permissions` — see DEPLOY.md §4.
 *
 * IDEMPOTENT. It only ever touches rows whose status is null, so re-running it is a
 * no-op and it can never overturn a real decision an instructor has made.
 *
 * Deliberately written against `strapi.db.query`, not the Document Service. This is
 * a data migration: it must reach the draft *and* published row of every document
 * and must not change anything's publication state. A Document Service update with
 * `status: 'published'` would publish a draft-only enrollment as a side effect,
 * which is not this script's business.
 */

const { compileStrapi, createStrapi } = require('@strapi/strapi');

const UID = 'api::enrollment.enrollment';
const APPROVED = 'approved';

const main = async () => {
  const { appDir, distDir } = await compileStrapi();
  const app = createStrapi({ appDir, distDir });

  await app.load();

  try {
    const stale = await strapi.db.query(UID).count({
      where: { current_status: { $null: true } },
    });

    if (stale === 0) {
      const total = await strapi.db.query(UID).count({});
      console.log(
        `Nothing to do — all ${total} enrollment row(s) already carry a status.`
      );
      return;
    }

    console.log(`${stale} enrollment row(s) have no status. Setting them to "${APPROVED}".`);

    await strapi.db.query(UID).updateMany({
      where: { current_status: { $null: true } },
      data: { current_status: APPROVED },
    });

    const remaining = await strapi.db.query(UID).count({
      where: { current_status: { $null: true } },
    });

    if (remaining > 0) {
      throw new Error(`${remaining} row(s) still have no status after the update.`);
    }

    // Counted per row rather than per document: draft and published versions are
    // separate rows, so this number is normally about twice the document count.
    console.log(`Done. ${stale} row(s) updated, nothing else touched.`);
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
