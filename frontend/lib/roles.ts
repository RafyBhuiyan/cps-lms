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

/** Human-readable label for the badge in the nav. */
export const roleLabel = (user: Profile | null): string => {
  if (isStudent(user)) return 'Student';
  if (isInstructor(user)) return 'Instructor';
  if (isContentManager(user)) return 'Content manager';
  if (isAdmin(user)) return 'Admin';
  return user?.role?.name ?? 'Unknown role';
};

/** Where signing in lands you. */
export const homeFor = (user: Profile | null): string => {
  if (isAdmin(user)) return '/dashboard/admin';
  if (isContentManager(user)) return '/dashboard/manager';
  if (isInstructor(user)) return '/dashboard/instructor';
  if (isStudent(user)) return '/dashboard/student';
  return '/courses';
};

export type { RoleType };
