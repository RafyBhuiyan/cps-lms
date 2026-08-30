'use client';

/**
 * Every enrolled student's progress in one course, and the requests waiting on a
 * decision.
 *
 * `GET /api/courses/:id/students-progress` is restricted to people who manage the
 * course, so an instructor cannot read another instructor's roster — the API checks
 * ownership, not this page. It is also the only place in the app where other
 * people's names and emails appear, and they arrive from that endpoint rather than
 * from a populated `user` relation, which Strapi would strip. That is also why the
 * pending queue is served from the same endpoint instead of from `/api/enrollments`.
 *
 * The server returns the least-progressed student first: the list exists to spot
 * who is falling behind, so that is the useful order. Requests come oldest first,
 * for the same reason.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
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
  /** The enrollment currently being decided, so only its buttons show as busy. */
  const [deciding, setDeciding] = useState<string | null>(null);
  const [decideError, setDecideError] = useState<string | null>(null);

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

  const decide = async (
    enrollmentId: string,
    action: 'approve' | 'reject' | 'reopen'
  ) => {
    if (!token) return;

    setDeciding(enrollmentId);
    setDecideError(null);

    try {
      if (action === 'approve') {
        await api.approveEnrollment(enrollmentId, token);
      } else if (action === 'reject') {
        await api.rejectEnrollment(enrollmentId, token);
      } else {
        await api.reopenEnrollment(enrollmentId, token);
      }

      reload();
    } catch (cause: unknown) {
      setDecideError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setDeciding(null);
    }
  };

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
  const requests = roster.pendingRequests ?? [];
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
          <Link
            href={`/dashboard/instructor/courses/${courseId}/edit`}
            className={btnSecondary}
          >
            Edit content
          </Link>
          <Link href={`/courses/${courseId}`} className={btnSecondary}>
            View course
          </Link>
        </>
      }
    >
      <div className="space-y-6">
        <Panel title={`Enrolment requests (${requests.length})`}>
          {decideError ? (
            <div className="mb-3">
              <ErrorNote message={decideError} />
            </div>
          ) : null}

          {requests.length === 0 ? (
            <Empty>
              No requests waiting. A student who asks to join appears here until you
              approve or decline them.
            </Empty>
          ) : (
            <ul className="space-y-3">
              {requests.map((request) => {
                const busy = deciding === request.enrollmentId;

                return (
                  <li
                    key={request.enrollmentId}
                    className={`${card} flex flex-wrap items-center justify-between gap-3`}
                  >
                    <div className="flex-1">
                      <p className="font-medium">
                        {request.username}{' '}
                        {request.currentStatus === 'rejected' ? (
                          <Badge tone="warn">Declined</Badge>
                        ) : (
                          <Badge>Waiting</Badge>
                        )}
                      </p>
                      <p className={muted}>
                        {request.email}
                        {request.requestedAt
                          ? ` · asked ${new Date(request.requestedAt).toLocaleDateString()}`
                          : ''}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      {request.currentStatus === 'rejected' ? (
                        // A rejection is final from the student's side — their own
                        // retry answers 409 — so this is the only way back.
                        <button
                          type="button"
                          onClick={() => void decide(request.enrollmentId, 'reopen')}
                          disabled={deciding !== null}
                          className={btnSecondary}
                        >
                          {busy ? 'Reopening…' : 'Allow to re-apply'}
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => void decide(request.enrollmentId, 'reject')}
                            disabled={deciding !== null}
                            className={btnSecondary}
                          >
                            {busy ? 'Saving…' : 'Decline'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void decide(request.enrollmentId, 'approve')}
                            disabled={deciding !== null}
                            className={btnPrimary}
                          >
                            {busy ? 'Saving…' : 'Approve'}
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Students">
          {roster.students.length === 0 ? (
            <Empty>Nobody is enrolled in this course yet.</Empty>
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
      </div>
    </Page>
  );
}
