/**
 * profile controller
 *
 * One endpoint, and it exists for a specific reason: the frontend has to know the
 * caller's role to decide what to render, and there is no supported way to learn
 * it from the endpoints users-permissions already exposes.
 *
 *   * `POST /api/auth/local` returns the user without its role — the login
 *     lookup runs no `populate` (plugin controllers/auth.js:146-157).
 *   * `GET /api/users/me?populate=role` validates the query like any content-API
 *     request, and populating a relation requires the *caller* to hold `find` on
 *     the relation's target (validate/visitors/throw-restricted-relations.js:82).
 *     The target here is `plugin::users-permissions.role`, and granting that to
 *     every logged-in user would also open `GET /api/users-permissions/roles`,
 *     which lists every role together with its full permission set.
 *
 * So the role is read server-side and only the two harmless fields — `name` and
 * `type` — are returned. `role` is always populated on `ctx.state.user` by the
 * auth strategy (plugin services/user.js), so this costs no extra query.
 */

import type { Context } from 'koa';
import { roleTypeOf } from '../../../utils/roles';

export default {
  /**
   * GET /api/profile/me
   *
   * The caller's identity plus role. Deliberately not the whole user record: no
   * `resetPasswordToken`, no `provider`, nothing the UI has no use for.
   */
  async me(ctx: Context) {
    const { user } = ctx.state;

    if (!user) {
      return ctx.unauthorized('You must be logged in.');
    }

    return {
      data: {
        id: user.id,
        documentId: user.documentId ?? null,
        username: user.username ?? null,
        email: user.email ?? null,
        role: {
          name: user.role?.name ?? null,
          type: roleTypeOf(user),
        },
      },
    };
  },
};
