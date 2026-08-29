'use client';

/**
 * Every enrolled student's progress in one course.
 *
 * `GET /api/courses/:id/students-progress` is restricted to people who manage the
 * course, so an instructor cannot read another instructor's roster — the API checks
 * ownership, not this page. It is also the only place in the app where other
 * people's names and emails appear, and they arrive from that endpoint rather than
 * from a populated `user` relation, which Strapi would strip.
 *
 * The server returns the least-progressed student first: the list exists to spot
 * who is falling behind, so that is the useful order.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import { ProgressBar } from '@/components/ProgressBar';
import { RequireRole } from '@/components/RequireRole';
import {
  Badge,
  Empty,
  ErrorNote,
  Loading,
  Page,
  Panel,
  btnSecondary,
  card,
  muted,
} from '@/components/ui';
import * as api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { canAuthorContent, isAdmin } from '@/lib/roles';
import { useAsync } from '@/lib/useAsync';

export default function CourseStudentsPage() {
  return (
    <RequireRole allow={[canAuthorContent]}>
      <CourseStudents />
    </RequireRole>
  );
}

function CourseStudents() {
  const params = useParams<{ id: string }>();
  const courseId = params.id;
  const { token, user } = useAuth();

  const load = useMemo(() => {
    if (!token) {
      return null;
    }

    return async () => {
      const [course, roster] = await Promise.all([
        api.getCourse(courseId, token),
        api.getStudentsProgress(courseId, token),
      ]);

      return { course, roster };
    };
  }, [courseId, token]);

  const { data, error, loading, reload } = useAsync(load);

  if (loading && !data) {
    return (
      <Page title="Students">
        <Loading />
      </Page>
    );
  }

  if (error || !data) {
    return (
      <Page title="Students">
        <ErrorNote message={error ?? 'Course not found.'} onRetry={reload} />
      </Page>
    );
  }

  const { course, roster } = data;
  const attempted = roster.students.filter((student) => student.finalQuiz?.attempted);
  const averageScore =
    attempted.length === 0
      ? null
      : Math.round(
          attempted.reduce((sum, student) => sum + (student.finalQuiz?.latestScore ?? 0), 0) /
            attempted.length
        );

  return (
    <Page
      title={course.title}
      intro={`${roster.totalStudents} enrolled${
        averageScore === null
          ? ', no final-quiz attempts yet'
          : `, final quiz averaging ${averageScore}% over ${attempted.length} attempt(s)`
      }.`}
      actions={
        <>
          {/* Admins and content managers can open any course's roster, so "back"
              means their own dashboard rather than the teaching list. */}
          <Link
            href={isAdmin(user) ? '/dashboard/admin' : '/dashboard/instructor'}
            className={btnSecondary}
          >
            Back
          </Link>
          <Link href={`/courses/${courseId}`} className={btnSecondary}>
            View course
          </Link>
        </>
      }
    >
      <Panel title="Students">
        {roster.students.length === 0 ? (
          <Empty>Nobody has enrolled in this course yet.</Empty>
        ) : (
          <ul className="space-y-4">
            {roster.students.map((student) => (
              <li key={student.userId} className={card}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{student.username}</p>
                    <p className={muted}>{student.email}</p>
                  </div>
                  {student.finalQuiz?.attempted ? (
                    <Badge tone="good">Final quiz {student.finalQuiz.latestScore}%</Badge>
                  ) : (
                    <Badge>Final quiz not taken</Badge>
                  )}
                </div>

                <div className="mt-3">
                  <ProgressBar
                    percent={student.progressPercent}
                    completed={student.completedLessons}
                    total={student.totalLessons}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </Page>
  );
}
