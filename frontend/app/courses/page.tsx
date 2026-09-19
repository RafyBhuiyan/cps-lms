'use client';

/**
 * The catalog. Readable without an account: the public role holds `course.find`,
 * which is why this page works signed out — the lesson list behind each course
 * does not.
 */

import Link from 'next/link';
import { useMemo } from 'react';
import * as api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAsync } from '@/lib/useAsync';
import { Empty, ErrorNote, Loading, Page, card, muted } from '@/components/ui';

export default function CoursesPage() {
  const { token, status } = useAuth();

  // Waits for the session check, so a signed-in visitor does not first fetch the
  // anonymous view and then refetch.
  const load = useMemo(
    () => (status === 'loading' ? null : () => api.listCourses(token)),
    [status, token]
  );
  const { data: courses, error, loading, reload } = useAsync(load);

  return (
    <Page
      title="Courses"
      intro="Everything published on the platform. Enrol from a course page to start tracking progress."
    >
      {loading || status === 'loading' ? <Loading /> : null}
      {error ? <ErrorNote message={error} onRetry={reload} /> : null}

      {courses ? (
        courses.length === 0 ? (
          <Empty>No courses have been published yet.</Empty>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => (
              <li key={course.documentId} className="group">
                <Link
                  href={`/courses/${course.documentId}`}
                  className={`${card} flex h-full flex-col transition-all hover:-translate-y-1 hover:shadow-lg hover:border-black/10 dark:hover:border-white/20`}
                >
                  <h2 className="text-xl font-bold tracking-tight text-zinc-900 group-hover:text-zinc-700 dark:text-zinc-100 dark:group-hover:text-zinc-300 transition-colors">{course.title}</h2>
                  {course.description ? (
                    <p className={`mt-3 line-clamp-3 flex-1 ${muted}`}>{course.description}</p>
                  ) : null}
                  <div className="mt-6 flex items-center text-sm font-medium text-zinc-900 dark:text-zinc-100 opacity-0 transition-opacity group-hover:opacity-100">
                    View Course <span className="ml-2">→</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </Page>
  );
}
