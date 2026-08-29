'use client';

/**
 * Admin dashboard: platform-wide counts, and a way into any course's roster.
 *
 * The counts come from `GET /api/admin/stats`, which is guarded twice — by the
 * `is-admin` policy on the route and again inside the handler — because it is the
 * one endpoint that reports on accounts. Documents are counted in their draft
 * version so a course still unpublished is not missing from the total.
 */

import Link from 'next/link';
import { useMemo } from 'react';
import { RequireRole } from '@/components/RequireRole';
import {
  Empty,
  ErrorNote,
  Loading,
  Page,
  Panel,
  Stat,
  btnSecondary,
  muted,
} from '@/components/ui';
import * as api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { isAdmin } from '@/lib/roles';
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

  return (
    <Page
      title="Platform"
      intro="Counts across the whole install, plus every course's student roster."
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
            <p className={`mt-4 ${muted}`}>
              Roles are assigned in the Strapi admin under Settings → Users &amp;
              Permissions → Users.
            </p>
          </Panel>

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
                    <Link
                      href={`/dashboard/instructor/courses/${course.documentId}`}
                      className={btnSecondary}
                    >
                      Students
                    </Link>
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
