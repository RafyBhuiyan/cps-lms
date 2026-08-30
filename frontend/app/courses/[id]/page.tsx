'use client';

/**
 * One course: its lessons, its quizzes, and — for an approved student — progress.
 *
 * Three things worth knowing about the data here:
 *
 *   * The lesson and quiz relations are populated only for callers whose role
 *     holds `find` on those types. Anonymous visitors get the course with the
 *     relations silently dropped, so this page invites them to sign in rather
 *     than showing an empty syllabus.
 *   * Enrolment is discovered by listing the caller's own enrollments — the API
 *     scopes that list server-side, so it cannot be used to see anyone else's.
 *     The whole row is kept rather than a boolean, because a request that is
 *     pending or declined is not the same as no request at all.
 *   * Progress is only fetched once approved; before that the endpoint would
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
import { isEnrollmentActive, type Enrollment, type ProgressLesson } from '@/lib/types';

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
        return { course, enrollment: null as Enrollment | null, progress: null };
      }

      const enrollments = await api.listEnrollments(token);
      const enrollment =
        enrollments.find((row) => row.course?.documentId === courseId) ?? null;

      return {
        course,
        enrollment,
        progress: isEnrollmentActive(enrollment)
          ? await api.getCourseProgress(courseId, token)
          : null,
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
      // 409 covers three states — already approved, already waiting, previously
      // declined — and the API says which, so the message is worth showing.
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

  const { course, enrollment, progress } = data;
  const enrolled = isEnrollmentActive(enrollment);
  const requestState = enrollment?.current_status ?? null;

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
        quizId: lesson.quiz?.documentId ?? null,
        // Whether that quiz has questions is not populated here, and only the
        // progress payload knows whether it was passed. Both are shown for an
        // approved student, which is the only case the fallback does not cover.
        quizRequired: Boolean(lesson.quiz),
        quizScore: null,
        quizPassed: false,
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
          <Panel
            title={
              enrolled
                ? 'Your progress'
                : requestState === 'pending'
                  ? 'Awaiting approval'
                  : requestState === 'rejected'
                    ? 'Request declined'
                    : 'Enrol'
            }
          >
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
            ) : requestState === 'pending' ? (
              <p className={muted}>
                Your request is with the course instructor. Once it is approved your
                progress will be tracked here and you will be able to take this
                course&apos;s quizzes.
              </p>
            ) : requestState === 'rejected' ? (
              <p className={muted}>
                The instructor declined your enrolment request. Contact them if you
                think that was a mistake — only they can reopen it.
              </p>
            ) : (
              <>
                <p className={muted}>
                  Request enrolment to track lesson completion and to take this
                  course&apos;s quizzes. An instructor approves it before you start.
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
                  {enrolling ? 'Requesting…' : 'Request enrolment'}
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
                  <div className="flex shrink-0 items-center gap-2">
                    {lesson.quizRequired ? (
                      progress ? (
                        <Badge tone={lesson.quizPassed ? 'good' : 'warn'}>
                          {lesson.quizPassed ? 'Quiz passed' : 'Quiz to pass'}
                        </Badge>
                      ) : (
                        <Badge>Has a quiz</Badge>
                      )
                    ) : null}
                    {lesson.completed ? <Badge tone="good">Completed</Badge> : null}
                  </div>
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
