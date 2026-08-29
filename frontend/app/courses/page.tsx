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
          <ul className="grid gap-4 sm:grid-cols-2">
            {courses.map((course) => (
              <li key={course.documentId}>
                <Link
                  href={`/courses/${course.documentId}`}
                  className={`${card} block h-full transition-colors hover:border-black/25 dark:hover:border-white/30`}
                >
                  <h2 className="font-semibold">{course.title}</h2>
                  {course.description ? (
                    <p className={`mt-2 line-clamp-3 ${muted}`}>{course.description}</p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </Page>
  );
}
