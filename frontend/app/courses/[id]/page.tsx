'use client';

/**
 * One course: its lessons, its quizzes, and — for an enrolled student — progress.
 *
 * Three things worth knowing about the data here:
 *
 *   * The lesson and quiz relations are populated only for callers whose role
 *     holds `find` on those types. Anonymous visitors get the course with the
 *     relations silently dropped, so this page invites them to sign in rather
 *     than showing an empty syllabus.
 *   * Enrolment is discovered by listing the caller's own enrollments — the API
 *     scopes that list server-side, so it cannot be used to see anyone else's.
 *   * Progress is only fetched once enrolled; before that the endpoint would
 *     honestly report 0%, which reads like a bug rather than an invitation.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ProgressBar } from '@/components/ProgressBar';
import {
  Badge,
  Empty,
  ErrorNote,
  Loading,
  Page,
  Panel,
  btnPrimary,
  btnSecondary,
  card,
  muted,
} from '@/components/ui';
import * as api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { canAuthorContent, isStudent } from '@/lib/roles';
import { useAsync } from '@/lib/useAsync';
import type { ProgressLesson } from '@/lib/types';

export default function CoursePage() {
  const params = useParams<{ id: string }>();
  const courseId = params.id;
  const { token, user, status } = useAuth();
  const [enrolling, setEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  const load = useMemo(() => {
    if (status === 'loading') {
      return null;
    }

    return async () => {
      const course = await api.getCourse(courseId, token);

      if (!token || !isStudent(user)) {
        return { course, enrolled: false, progress: null };
      }

      const enrollments = await api.listEnrollments(token);
      const enrolled = enrollments.some(
        (enrollment) => enrollment.course?.documentId === courseId
      );

      return {
        course,
        enrolled,
        progress: enrolled ? await api.getCourseProgress(courseId, token) : null,
      };
    };
  }, [courseId, token, user, status]);

  const { data, error, loading, reload } = useAsync(load);

  const enrol = async () => {
    if (!token) return;

    setEnrolling(true);
    setEnrollError(null);

    try {
      await api.enroll(courseId, token);
      reload();
    } catch (cause: unknown) {
      // 409 means already enrolled, which is not really an error — reloading
      // shows the enrolled view.
      setEnrollError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setEnrolling(false);
    }
  };

  if (loading || status === 'loading') {
    return (
      <Page title="Course">
        <Loading />
      </Page>
    );
  }

  if (error || !data) {
    return (
      <Page title="Course">
        <ErrorNote message={error ?? 'Course not found.'} onRetry={reload} />
      </Page>
    );
  }

  const { course, enrolled, progress } = data;

  // The progress payload already carries the lesson list, sorted and flagged, so
  // it is preferred; the populated relation is the fallback for everyone else.
  const lessons: ProgressLesson[] =
    progress?.lessons ??
    [...(course.lessons ?? [])]
      .sort((a, b) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0))
      .map((lesson) => ({
        documentId: lesson.documentId,
        title: lesson.title,
        sequenceOrder: lesson.sequenceOrder,
        completed: false,
      }));

  const practiceQuizzes = course.practice_quizzes ?? [];

  return (
    <Page
      title={course.title}
      intro={course.description ?? undefined}
      actions={
        canAuthorContent(user) ? (
          <Link href={`/dashboard/instructor/courses/${courseId}`} className={btnSecondary}>
            Student progress
          </Link>
        ) : null
      }
    >
      <div className="space-y-6">
        {!user ? (
          <Panel>
            <p className={muted}>
              Sign in to see the lessons and quizzes for this course.
            </p>
            <Link href="/login" className={`${btnPrimary} mt-3`}>
              Sign in
            </Link>
          </Panel>
        ) : null}

        {isStudent(user) ? (
          <Panel title={enrolled ? 'Your progress' : 'Enrol'}>
            {enrolled && progress ? (
              <>
                <ProgressBar
                  percent={progress.progressPercent}
                  completed={progress.completedLessons}
                  total={progress.totalLessons}
                />
                {progress.finalQuiz ? (
                  <p className={`mt-4 ${muted}`}>
                    Final quiz:{' '}
                    {progress.finalQuiz.attempted ? (
                      <strong>{progress.finalQuiz.latestScore}%</strong>
                    ) : (
                      'not attempted yet'
                    )}
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <p className={muted}>
                  Enrol to track lesson completion and to take this course&apos;s quizzes.
                </p>
                {enrollError ? (
                  <div className="mt-3">
                    <ErrorNote message={enrollError} />
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={enrol}
                  disabled={enrolling}
                  className={`${btnPrimary} mt-3`}
                >
                  {enrolling ? 'Enrolling…' : 'Enrol in this course'}
                </button>
              </>
            )}
          </Panel>
        ) : null}

        <Panel title={`Lessons${lessons.length ? ` (${lessons.length})` : ''}`}>
          {lessons.length === 0 ? (
            <Empty>
              {user ? 'This course has no published lessons yet.' : 'Sign in to view lessons.'}
            </Empty>
          ) : (
            <ol className="divide-y divide-black/10 dark:divide-white/15">
              {lessons.map((lesson, index) => (
                <li
                  key={lesson.documentId}
                  className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <Link
                    href={`/lessons/${lesson.documentId}`}
                    className="flex-1 hover:underline"
                  >
                    <span className={`mr-3 tabular-nums ${muted}`}>
                      {lesson.sequenceOrder ?? index + 1}
                    </span>
                    {lesson.title}
                  </Link>
                  {lesson.completed ? <Badge tone="good">Completed</Badge> : null}
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title="Quizzes">
          {!course.final_quiz && practiceQuizzes.length === 0 ? (
            <Empty>
              {user ? 'No quizzes on this course yet.' : 'Sign in to view quizzes.'}
            </Empty>
          ) : (
            <ul className="space-y-3">
              {course.final_quiz ? (
                <li className={`${card} flex flex-wrap items-center justify-between gap-3`}>
                  <div>
                    {/* A quiz has no title of its own; which course relation is set
                        is what makes it the final quiz. */}
                    <p className="font-medium">Final quiz</p>
                    <p className={muted}>Graded and recorded. The latest score counts.</p>
                  </div>
                  <Link
                    href={`/quizzes/${course.final_quiz.documentId}`}
                    className={btnPrimary}
                  >
                    {enrolled ? 'Take quiz' : 'View'}
                  </Link>
                </li>
              ) : null}

              {practiceQuizzes.map((quiz, index) => (
                <li
                  key={quiz.documentId}
                  className={`${card} flex flex-wrap items-center justify-between gap-3`}
                >
                  <div>
                    <p className="font-medium">
                      Practice quiz{practiceQuizzes.length > 1 ? ` ${index + 1}` : ''}
                    </p>
                    <p className={muted}>Scored for feedback; nothing is recorded.</p>
                  </div>
                  <Link href={`/quizzes/${quiz.documentId}`} className={btnSecondary}>
                    {enrolled ? 'Practise' : 'View'}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </Page>
  );
}
