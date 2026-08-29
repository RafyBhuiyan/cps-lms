/**
 * Role helpers.
 *
 * Roles live in the database (`up_roles`), not in code, so these constants match
 * the `type` column of the roles configured in the Strapi dashboard. `role` is
 * always populated on `ctx.state.user` — the users-permissions auth strategy
 * loads it with `populate: ['role']` (services/user.js:119) — so reading
 * `user.role.type` on an authenticated request is safe.
 *
 * Student is the built-in `authenticated` role renamed "Student" rather than a
 * new role, which is why `isStudent()` accepts both spellings.
 */

export const ROLE = {
  ADMIN: 'admin',
  CONTENT_MANAGER: 'content_manager',
  INSTRUCTOR: 'instructor',
  STUDENT: 'authenticated',
} as const;

export type AuthUser = {
  id: number;
  documentId?: string;
  username?: string;
  email?: string;
  role?: { id?: number; name?: string; type?: string } | null;
} | null | undefined;

export const roleTypeOf = (user: AuthUser): string | null => user?.role?.type ?? null;

export const isAdmin = (user: AuthUser) => roleTypeOf(user) === ROLE.ADMIN;

export const isContentManager = (user: AuthUser) => roleTypeOf(user) === ROLE.CONTENT_MANAGER;

export const isInstructor = (user: AuthUser) => roleTypeOf(user) === ROLE.INSTRUCTOR;

/**
 * Accepts a future dedicated `student` role as well as today's renamed
 * `authenticated` one, so this does not silently start returning false if the
 * role setup changes.
 */
export const isStudent = (user: AuthUser) => {
  const type = roleTypeOf(user);
  return type === ROLE.STUDENT || type === 'student';
};

/** admin and content_manager both get site-wide read access. */
export const isPrivileged = (user: AuthUser) => isAdmin(user) || isContentManager(user);
