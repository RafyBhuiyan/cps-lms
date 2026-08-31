'use client';

/**
 * Admin dashboard: platform-wide counts, who holds which role, and a way into any
 * course's roster.
 *
 * The counts come from `GET /api/admin/stats` and the accounts from
 * `GET /api/admin/users`. Both are guarded twice — by the `is-admin` policy on the
 * route and again inside the handler — because they are the endpoints that report
 * on accounts. Documents are counted in their draft version so a course still
 * unpublished is not missing from the total.
 *
 * The two loads are separate `useAsync` calls on purpose: changing the People
 * filters re-runs only that query, and a role change reloads the directory *and*
 * the counts, since assigning a role moves someone between the tallies above.
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { RequireRole } from '@/components/RequireRole';
import {
  Badge,
  Empty,
  ErrorNote,
  Loading,
  Page,
  Panel,
  Stat,
  btnSecondary,
  card,
  input,
  label,
  muted,
} from '@/components/ui';
import * as api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { isAdmin, roleLabelOf } from '@/lib/roles';
import type { AdminUser, Course } from '@/lib/types';
import { useAsync } from '@/lib/useAsync';

export default function AdminDashboardPage() {
  return (
    <RequireRole allow={[isAdmin]}>
      <AdminDashboard />
    </RequireRole>
  );
}

function AdminDashboard() {
  const { token } = useAuth();

  const load = useMemo(() => {
    if (!token) {
      return null;
    }

    return async () => {
      const [stats, courses] = await Promise.all([
        api.getPlatformStats(token),
        api.listCourses(token),
      ]);

      return { stats, courses };
    };
  }, [token]);

  const { data, error, loading, reload } = useAsync(load);

  const removeCourse = async (course: Course) => {
    if (!token) return;

    if (!window.confirm(`Delete “${course.title}”? This removes the course and its lessons.`)) {
      return;
    }

    try {
      await api.deleteCourse(course.documentId, token);
      reload();
    } catch (cause: unknown) {
      window.alert(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <Page
      title="Platform"
      intro="Counts across the whole install, who holds which role, and every course's student roster."
      actions={
        <Link href="/dashboard/manager" className={btnSecondary}>
          Posts
        </Link>
      }
    >
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorNote message={error} onRetry={reload} /> : null}

      {data ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Users" value={data.stats.totalUsers} />
            <Stat label="Courses" value={data.stats.totalCourses} />
            <Stat label="Lessons" value={data.stats.totalLessons} />
            <Stat label="Enrollments" value={data.stats.totalEnrollments} />
            <Stat label="Quizzes" value={data.stats.totalQuizzes} />
            <Stat label="Blog posts" value={data.stats.totalBlogs} />
          </div>

          <Panel title="Accounts by role">
            <ul className="divide-y divide-black/10 dark:divide-white/15">
              {data.stats.usersByRole.map((entry) => (
                <li
                  key={entry.role}
                  className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="font-medium">{entry.name}</p>
                    {/* The role `type` is what the API checks, and it is worth
                        showing: the student role is `authenticated`, which is not
                        obvious from its display name. */}
                    <p className={muted}>{entry.role}</p>
                  </div>
                  <p className="text-lg font-semibold tabular-nums">{entry.users}</p>
                </li>
              ))}
            </ul>
          </Panel>

          <People onRoleChange={reload} />

          <Panel title={`Courses (${data.courses.length})`}>
            {data.courses.length === 0 ? (
              <Empty>No courses yet.</Empty>
            ) : (
              <ul className="divide-y divide-black/10 dark:divide-white/15">
                {data.courses.map((course) => (
                  <li
                    key={course.documentId}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <Link
                      href={`/courses/${course.documentId}`}
                      className="font-medium hover:underline"
                    >
                      {course.title}
                    </Link>
                    <div className="flex gap-2">
                      <Link
                        href={`/dashboard/instructor/courses/${course.documentId}/edit`}
                        className={btnSecondary}
                      >
                        Edit
                      </Link>
                      <button
                        type="button"
                        onClick={() => void removeCourse(course)}
                        className={btnSecondary}
                      >
                        Delete
                      </button>
                      <Link
                        href={`/dashboard/instructor/courses/${course.documentId}`}
                        className={btnSecondary}
                      >
                        Students
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}
    </Page>
  );
}

/**
 * The account directory, with a role select per row.
 *
 * The filters live in state and feed the memoized loader, so narrowing the list is
 * a refetch rather than a client-side filter — the endpoint pages at 100 and there
 * may be more accounts than that.
 */
function People({ onRoleChange }: { onRoleChange: () => void }) {
  const { token, user } = useAuth();
  const [roleFilter, setRoleFilter] = useState('');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  const load = useMemo(
    () =>
      token
        ? () => api.listUsers(token, { role: roleFilter || undefined, q: search || undefined })
        : null,
    [token, roleFilter, search]
  );

  const { data, error, loading, reload } = useAsync(load);

  const assign = async (target: AdminUser, roleType: string) => {
    if (!token || roleType === target.role?.type) return;

    setBusyId(target.id);
    setAssignError(null);

    try {
      await api.setUserRole(target.id, roleType, token);
      reload();
      // The per-role tallies above are now stale.
      onRoleChange();
    } catch (cause: unknown) {
      setAssignError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Panel title={`People${data ? ` (${data.total})` : ''}`}>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className={label} htmlFor="people-role">
            Role
          </label>
          <select
            id="people-role"
            className={input}
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
          >
            <option value="">All roles</option>
            {(data?.roles ?? []).map((role) => (
              <option key={role.type} value={role.type}>
                {roleLabelOf(role.type) ?? role.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1">
          <label className={label} htmlFor="people-search">
            Search
          </label>
          <input
            id="people-search"
            className={input}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name or email"
          />
        </div>
      </div>

      {loading && !data ? <Loading /> : null}
      {error ? <ErrorNote message={error} onRetry={reload} /> : null}
      {assignError ? (
        <div className="mb-3">
          <ErrorNote message={assignError} />
        </div>
      ) : null}

      {data ? (
        data.users.length === 0 ? (
          <Empty>No accounts match that.</Empty>
        ) : (
          <>
            <ul className="space-y-3">
              {data.users.map((account) => {
                // The server refuses to change the caller's own role, so the
                // select is disabled rather than left to fail on submit.
                const self = account.id === user?.id;

                return (
                  <li
                    key={account.id}
                    className={`${card} flex flex-wrap items-center justify-between gap-3`}
                  >
                    <div className="flex-1">
                      <p className="font-medium">
                        {account.username ?? account.email ?? `User ${account.id}`}
                        {self ? <span className={`ml-2 ${muted}`}>you</span> : null}
                      </p>
                      <p className={muted}>{account.email}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {account.blocked ? <Badge tone="warn">Blocked</Badge> : null}
                      {account.confirmed ? null : <Badge tone="warn">Unconfirmed</Badge>}

                      <select
                        className={input}
                        aria-label={`Role for ${account.username ?? account.email ?? account.id}`}
                        value={account.role?.type ?? ''}
                        disabled={self || busyId !== null}
                        onChange={(event) => void assign(account, event.target.value)}
                      >
                        {/* Present only for an account holding some role this
                            platform does not assign, so the select still shows
                            what it actually has. */}
                        {account.role?.type &&
                        !data.roles.some((role) => role.type === account.role?.type) ? (
                          <option value={account.role.type}>
                            {account.role.name ?? account.role.type}
                          </option>
                        ) : null}
                        {data.roles.map((role) => (
                          <option key={role.type} value={role.type}>
                            {roleLabelOf(role.type) ?? role.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </li>
                );
              })}
            </ul>

            {data.total > data.users.length ? (
              <p className={`mt-4 ${muted}`}>
                Showing {data.users.length} of {data.total}. Narrow the list with the
                role filter or search.
              </p>
            ) : null}

            <p className={`mt-4 ${muted}`}>
              Changing a role takes effect on that account&apos;s next request. You
              cannot change your own — ask another admin.
            </p>
          </>
        )
      ) : null}
    </Panel>
  );
}