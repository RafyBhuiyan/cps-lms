'use client';

/**
 * Student dashboard: the courses you are enrolled in, how far through each you
 * are, and your recorded grades.
 *
 * Every number here comes from the API. Progress is recomputed server-side per
 * course, and grades come from the quiz-result rows the grading endpoint wrote —
 * nothing on this page is tallied in the browser.
 */

import Link from 'next/link';
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
  btnPrimary,
  btnSecondary,
  card,
  muted,
} from '@/components/ui';
import * as api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { isStudent } from '@/lib/roles';
import { useAsync } from '@/lib/useAsync';

export default function StudentDashboardPage() {
  return (
    <RequireRole allow={[isStudent]}>
      <StudentDashboard />
    </RequireRole>
  );
}

function StudentDashboard() {
  const { token, user } = useAuth();

  const load = useMemo(() => {
    if (!token) {
      return null;
    }

    return async () => {
      const [enrollments, results] = await Promise.all([
        api.listEnrollments(token),
        api.listQuizResults(token),
      ]);

      // One progress call per enrolled course. There is no bulk endpoint for a
      // student's own progress, and the alternative — counting lesson-progress
      // rows in the browser — would disagree with the server the moment a lesson
      // is added or unpublished.
      const courses = await Promise.all(
        enrollments
          .filter((enrollment) => enrollment.course)
          .map(async (enrollment) => ({
            course: enrollment.course!,
            progress: await api.getCourseProgress(enrollment.course!.documentId, token),
          }))
      );

      return { courses, results };
    };
  }, [token]);

  const { data, error, loading, reload } = useAsync(load);

  return (
    <Page
      title="My learning"
      intro={user?.username ? `Signed in as ${user.username}.` : undefined}
      actions={
        <Link href="/courses" className={btnSecondary}>
          Browse courses
        </Link>
      }
    >
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorNote message={error} onRetry={reload} /> : null}

      {data ? (
        <div className="space-y-6">
          <Panel title={`Enrolled courses (${data.courses.length})`}>
            {data.courses.length === 0 ? (
              <Empty>
                You are not enrolled in anything yet.{' '}
                <Link href="/courses" className="underline">
                  Find a course
                </Link>
                .
              </Empty>
            ) : (
              <ul className="space-y-4">
                {data.courses.map(({ course, progress }) => {
                  const next = progress.lessons.find((lesson) => !lesson.completed);

                  return (
                    <li key={course.documentId} className={card}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <Link
                          href={`/courses/${course.documentId}`}
                          className="font-semibold hover:underline"
                        >
                          {course.title}
                        </Link>
                        {progress.finalQuiz?.attempted ? (
                          <Badge tone="good">Final quiz {progress.finalQuiz.latestScore}%</Badge>
                        ) : progress.finalQuiz ? (
                          <Badge>Final quiz not taken</Badge>
                        ) : null}
                      </div>

                      <div className="mt-3">
                        <ProgressBar
                          percent={progress.progressPercent}
                          completed={progress.completedLessons}
                          total={progress.totalLessons}
                        />
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        {next ? (
                          <Link href={`/lessons/${next.documentId}`} className={btnPrimary}>
                            Continue: {next.title}
                          </Link>
                        ) : progress.totalLessons > 0 ? (
                          <span className={muted}>All lessons complete.</span>
                        ) : (
                          <span className={muted}>No lessons in this course yet.</span>
                        )}
                        {progress.finalQuiz ? (
                          <Link
                            href={`/quizzes/${progress.finalQuiz.quizId}`}
                            className={btnSecondary}
                          >
                            {progress.finalQuiz.attempted ? 'Retake final quiz' : 'Take final quiz'}
                          </Link>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Grades">
            {data.results.length === 0 ? (
              <Empty>
                No graded attempts yet. Only final quizzes are recorded — practice
                quizzes are scored on screen and stored nowhere.
              </Empty>
            ) : (
              <ul className="divide-y divide-black/10 dark:divide-white/15">
                {data.results.map((result) => (
                  <li
                    key={result.documentId}
                    className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <div>
                      <p className="font-medium">
                        {result.quiz?.course?.title ?? 'Final quiz'}
                      </p>
                      <p className={muted}>
                        {result.updateTime
                          ? `Last attempt ${new Date(result.updateTime).toLocaleString()}`
                          : 'Attempt time not recorded'}
                      </p>
                    </div>
                    <p className="text-xl font-semibold tabular-nums">
                      {result.latestScore ?? 0}%
                    </p>
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
