/**
 * Role helpers, mirroring `backend/src/utils/roles.ts`.
 *
 * The student role is the built-in `authenticated` role renamed "Student" in the
 * dashboard, so `authenticated` is what the API reports for a student — not
 * "student". Getting that backwards silently hides the whole student UI.
 */

import type { Profile, RoleType } from './types';

export const ROLE = {
  STUDENT: 'authenticated',
  INSTRUCTOR: 'instructor',
  CONTENT_MANAGER: 'content_manager',
  ADMIN: 'admin',
} as const;

export const roleTypeOf = (user: Profile | null): string | null => user?.role?.type ?? null;

export const isStudent = (user: Profile | null) => {
  const type = roleTypeOf(user);
  // Accepts a future dedicated `student` role too, as the backend does.
  return type === ROLE.STUDENT || type === 'student';
};

export const isInstructor = (user: Profile | null) => roleTypeOf(user) === ROLE.INSTRUCTOR;

export const isContentManager = (user: Profile | null) =>
  roleTypeOf(user) === ROLE.CONTENT_MANAGER;

export const isAdmin = (user: Profile | null) => roleTypeOf(user) === ROLE.ADMIN;

/** Who may manage course content: instructors, content managers, admins. */
export const canAuthorContent = (user: Profile | null) =>
  isInstructor(user) || isContentManager(user) || isAdmin(user);

/**
 * Human-readable label for a role `type`.
 *
 * Separate from `roleLabel` because the admin dashboard labels *other* accounts,
 * which arrive as a bare type rather than as a `Profile`. Both go through this so
 * the two can never disagree.
 */
export const roleLabelOf = (type: string | null | undefined): string | null => {
  if (type === ROLE.STUDENT || type === 'student') return 'Student';
  if (type === ROLE.INSTRUCTOR) return 'Instructor';
  if (type === ROLE.CONTENT_MANAGER) return 'Content manager';
  if (type === ROLE.ADMIN) return 'Admin';
  return null;
};

/** Human-readable label for the badge in the nav. */
export const roleLabel = (user: Profile | null): string =>
  roleLabelOf(roleTypeOf(user)) ?? user?.role?.name ?? 'Unknown role';

/** Where signing in lands you. */
export const homeFor = (user: Profile | null): string => {
  if (isAdmin(user)) return '/dashboard/admin';
  if (isContentManager(user)) return '/dashboard/manager';
  if (isInstructor(user)) return '/dashboard/instructor';
  if (isStudent(user)) return '/dashboard/student';
  return '/courses';
};

export type { RoleType };
