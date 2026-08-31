'use client';

/**
 * Instructor dashboard: the courses you own or co-teach, and a way to add one.
 *
 * The list comes from `/api/courses?mine=true`. It has to be a server-side scope
 * because the obvious client-side equivalent — `?filters[creator][id]=me` — reaches
 * through a relation to the user type, which Strapi rejects for any role that
 * cannot list users. Granting that would let every instructor enumerate accounts.
 *
 * Creating a course is the only write an instructor has here; everything else about
 * it — its fields, its lessons, and which quiz gates which lesson — is edited on the
 * course's own edit page, and the quiz *questions* on the editor that page links to.
 * An instructor reaches only their own courses either way: the ownership policies
 * behind those pages resolve the course a request names and refuse the rest.
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { RequireRole } from '@/components/RequireRole';
import {
  Empty,
  ErrorNote,
  Loading,
  Page,
  Panel,
  btnPrimary,
  btnSecondary,
  card,
  input,
  label,
  muted,
} from '@/components/ui';
import * as api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { isAdmin, isInstructor } from '@/lib/roles';
import type { Course } from '@/lib/types';
import { useAsync } from '@/lib/useAsync';

export default function InstructorDashboardPage() {
  return (
    <RequireRole allow={[isInstructor, isAdmin]}>
      <InstructorDashboard />
    </RequireRole>
  );
}

function InstructorDashboard() {
  const { token } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useMemo(
    () => (token ? () => api.listMyCourses(token) : null),
    [token]
  );
  const { data: courses, error, loading, reload } = useAsync(load);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!token) return;

    setCreating(true);
    setCreateError(null);

    try {
      // `creator` is set from the token server-side, so a new course is yours
      // whatever the body says.
      await api.createCourse({ title: title.trim(), description: description.trim() }, token);
      setTitle('');
      setDescription('');
      reload();
    } catch (cause: unknown) {
      setCreateError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setCreating(false);
    }
  };

  const removeCourse = async (course: Course) => {
    if (!token) return;

    if (!window.confirm(`Delete “${course.title}”? This removes the course and its lessons.`)) {
      return;
    }

    try {
      await api.deleteCourse(course.documentId, token);
      reload();
    } catch (cause: unknown) {
      setCreateError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <Page
      title="Teaching"
      intro="Courses you created or co-teach. Open one to see how your students are doing."
    >
      <div className="space-y-6">
        <Panel title={`Your courses${courses ? ` (${courses.length})` : ''}`}>
          {loading && !courses ? <Loading /> : null}
          {error ? <ErrorNote message={error} onRetry={reload} /> : null}

          {courses ? (
            courses.length === 0 ? (
              <Empty>
                You are not attached to any course yet. Create one below, or ask an
                admin to add you as an instructor on an existing course.
              </Empty>
            ) : (
              <ul className="space-y-3">
                {courses.map((course) => (
                  <li
                    key={course.documentId}
                    className={`${card} flex flex-wrap items-center justify-between gap-3`}
                  >
                    <div className="flex-1">
                      <p className="font-semibold">{course.title}</p>
                      {course.description ? (
                        <p className={`mt-1 line-clamp-2 ${muted}`}>{course.description}</p>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/courses/${course.documentId}`} className={btnSecondary}>
                        View
                      </Link>
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
                        className={btnPrimary}
                      >
                        Students
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </Panel>

        <Panel title="New course">
          <form onSubmit={create} className="max-w-xl space-y-4">
            <div>
              <label className={label} htmlFor="course-title">
                Title
              </label>
              <input
                id="course-title"
                className={input}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
            </div>

            <div>
              <label className={label} htmlFor="course-description">
                Description
              </label>
              <textarea
                id="course-description"
                className={`${input} min-h-24`}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>

            {createError ? <ErrorNote message={createError} /> : null}

            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={creating} className={btnPrimary}>
                {creating ? 'Creating…' : 'Create course'}
              </button>
              <span className={muted}>
                Then use Edit to write its lessons and attach their quizzes.
              </span>
            </div>
          </form>
        </Panel>
      </div>
    </Page>
  );
}