/**
 * admin controller
 *
 * Platform-wide reads and the one platform-wide write: assigning a role. All of
 * it is admin-only, guarded twice — by the `is-admin` policy on every route in
 * `routes/admin.ts`, and again in each handler, so a handler stays safe even if
 * the route config is edited later.
 *
 * Why these endpoints exist rather than the built-in ones:
 *
 *   * `GET /api/users` would need `plugin::users-permissions.user.find`, and
 *     `?populate=role` would additionally need `role.find` — which also opens
 *     `GET /api/users-permissions/roles`, listing every role with its full
 *     permission set. Granting either is account enumeration.
 *   * The narrow payloads below expose only what the dashboard renders, so no
 *     new grant is needed and nothing sensitive can leak through a populate.
 *
 * `strapi.db.query` bypasses the REST sanitizers, so every read here names its
 * columns explicitly. The user type carries `password`, `resetPasswordToken` and
 * `confirmationToken`; a bare `findMany` would return all three.
 */

import type { Context } from 'koa';
import { ANY_VERSION } from '../../../utils/lms';
import { ROLE, isAdmin } from '../../../utils/roles';

/** The only role types this endpoint will assign. */
const ASSIGNABLE = new Set<string>(Object.values(ROLE));

const USER_FIELDS = ['id', 'username', 'email', 'confirmed', 'blocked', 'createdAt'] as const;

const ROLE_FIELDS = ['id', 'name', 'type'] as const;

/** The shape the dashboard reads. Built explicitly so nothing else can ride along. */
const toRow = (row: any) => ({
  id: row.id,
  username: row.username ?? null,
  email: row.email ?? null,
  confirmed: Boolean(row.confirmed),
  blocked: Boolean(row.blocked),
  createdAt: row.createdAt ?? null,
  role: row.role ? { name: row.role.name ?? null, type: row.role.type ?? null } : null,
});

const roles = () =>
  strapi.db.query('plugin::users-permissions.role').findMany({ select: [...ROLE_FIELDS] });

export default {
  /**
   * GET /api/admin/stats
   *
   * Account counts per role plus one count per content type. The per-role counts
   * are what the dashboard's People panel filters by, so the two stay consistent
   * by reading the same role table.
   */
  async stats(ctx: Context) {
    const { user } = ctx.state;

    if (!user) {
      return ctx.unauthorized('You must be logged in to view platform statistics.');
    }

    if (!isAdmin(user)) {
      return ctx.forbidden('Administrator access required.');
    }

    // Roles and users are not draft/publish content types, so these go through
    // the query engine directly.
    const all = await roles();

    const usersByRole = await Promise.all(
      all.map(async (role: any) => ({
        role: role.type,
        name: role.name,
        users: await strapi.db
          .query('plugin::users-permissions.user')
          .count({ where: { role: role.id } }),
      }))
    );

    // Counted with ANY_VERSION so each document counts once; counting published
    // rows would undercount anything still in draft.
    const [totalCourses, totalLessons, totalEnrollments, totalQuizzes, totalBlogs] =
      await Promise.all([
        strapi.documents('api::course.course').count({ ...ANY_VERSION }),
        strapi.documents('api::lesson.lesson').count({ ...ANY_VERSION }),
        strapi.documents('api::enrollment.enrollment').count({ ...ANY_VERSION }),
        strapi.documents('api::quiz.quiz').count({ ...ANY_VERSION }),
        strapi.documents('api::blog.blog').count({ ...ANY_VERSION }),
      ]);

    return {
      data: {
        totalUsers: usersByRole.reduce((sum, entry) => sum + entry.users, 0),
        usersByRole,
        totalCourses,
        totalLessons,
        totalEnrollments,
        totalQuizzes,
        totalBlogs,
      },
    };
  },

  /**
   * GET /api/admin/users[?role=<type>&q=<text>&page=&pageSize=]
   *
   * The account directory, with the assignable roles in the same payload so the
   * dashboard can render its role selects from one request.
   *
   * `total` is returned alongside the page because a truncated list that looks
   * complete is worse than no list: the admin has to be able to see that there
   * are more accounts than the ones on screen.
   */
  async users(ctx: Context) {
    const { user } = ctx.state;

    if (!user) {
      return ctx.unauthorized('You must be logged in to list accounts.');
    }

    if (!isAdmin(user)) {
      return ctx.forbidden('Administrator access required.');
    }

    const query = ctx.query as Record<string, unknown>;
    const roleType = typeof query.role === 'string' ? query.role.trim() : '';
    const search = typeof query.q === 'string' ? query.q.trim() : '';

    const page = Math.max(1, Number(query.page) || 1);
    // Matches `rest.maxLimit` in config/api.ts, so this endpoint cannot be used
    // to pull the whole table in one request either.
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 100));

    const where: Record<string, unknown> = {};

    if (roleType) {
      where.role = { type: roleType };
    }

    if (search) {
      where.$or = [{ username: { $containsi: search } }, { email: { $containsi: search } }];
    }

    const [rows, total, all] = await Promise.all([
      strapi.db.query('plugin::users-permissions.user').findMany({
        select: [...USER_FIELDS],
        populate: { role: { select: [...ROLE_FIELDS] } },
        where,
        orderBy: { createdAt: 'desc' },
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
      strapi.db.query('plugin::users-permissions.user').count({ where }),
      roles(),
    ]);

    return {
      data: {
        users: rows.map(toRow),
        // Only the roles this platform assigns, so the dashboard never offers
        // `public` — which `setUserRole` would refuse anyway.
        roles: all
          .filter((role: any) => ASSIGNABLE.has(role.type))
          .map((role: any) => ({ id: role.id, name: role.name, type: role.type })),
        total,
        page,
        pageSize,
      },
    };
  },

  /**
   * PUT /api/admin/users/:id/role
   *
   * Body: `{ "role": "instructor" }` — a role *type*, not a database id, so the
   * frontend never has to know the contents of `up_roles`.
   */
  async setUserRole(ctx: Context) {
    const { user } = ctx.state;

    if (!user) {
      return ctx.unauthorized('You must be logged in to assign roles.');
    }

    if (!isAdmin(user)) {
      return ctx.forbidden('Administrator access required.');
    }

    const targetId = Number(ctx.params.id);

    if (!Number.isInteger(targetId) || targetId <= 0) {
      return ctx.badRequest('The user id must be a positive integer.');
    }

    // An admin demoting themselves would lose the dashboard mid-request, and if
    // they are the only admin the platform has no way back in — role assignment
    // lives behind this very endpoint. Another admin can still do it.
    if (targetId === user.id) {
      return ctx.badRequest(
        'You cannot change your own role. Ask another administrator to do it.'
      );
    }

    const requested = (ctx.request.body as { role?: unknown } | undefined)?.role;

    if (typeof requested !== 'string' || !requested.trim()) {
      return ctx.badRequest('Body must be { "role": "<role type>" }.');
    }

    const roleType = requested.trim();

    // Checked against the platform's own role list rather than whatever exists in
    // `up_roles`: `public` is a real row there, and moving a user into it would
    // leave them unable to log in as anyone.
    if (!ASSIGNABLE.has(roleType)) {
      return ctx.badRequest(
        `Unknown role "${roleType}". Expected one of: ${[...ASSIGNABLE].join(', ')}.`
      );
    }

    const role = await strapi.db
      .query('plugin::users-permissions.role')
      .findOne({ select: [...ROLE_FIELDS], where: { type: roleType } });

    if (!role) {
      return ctx.badRequest(
        `The "${roleType}" role does not exist on this instance. Create it in Settings -> Users & Permissions -> Roles.`
      );
    }

    const target = await strapi.db
      .query('plugin::users-permissions.user')
      .findOne({ select: [...USER_FIELDS], where: { id: targetId } });

    if (!target) {
      return ctx.notFound('User not found.');
    }

    // Through the plugin service rather than `db.query.update`: it resolves the
    // documentId and hands the relation to the Document Service, which is what
    // keeps the join table consistent (plugin services/user.js:86).
    await strapi.plugin('users-permissions').service('user').edit(targetId, {
      role: role.id,
    });

    // Re-read rather than trusting the service's return value, so the response
    // reflects what was actually stored.
    const updated = await strapi.db.query('plugin::users-permissions.user').findOne({
      select: [...USER_FIELDS],
      populate: { role: { select: [...ROLE_FIELDS] } },
      where: { id: targetId },
    });

    return { data: toRow(updated) };
  },
};
