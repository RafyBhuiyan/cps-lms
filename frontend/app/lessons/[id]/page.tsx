'use client';

/**
 * One lesson: its content, its quiz if it has one, and for an enrolled student the
 * completion toggle.
 *
 * Sign-in is required — `lesson.findOne` is not granted to the public role, so
 * this page has nothing to show an anonymous visitor. Any signed-in role may read
 * a lesson (instructors and editors need to preview them); only students can mark
 * one complete, and only in a course they are enrolled in, both enforced by the API.
 *
 * A lesson whose quiz has not been passed cannot be completed and does not release
 * its Next link. The UI only mirrors that — the API refuses the write either way,
 * on both `/lessons/:id/complete` and `POST /api/lesson-progresses`.
 *
 * One state is not a lock, though it looks like one: a lesson already completed
 * whose quiz was then retaken and failed. The gate reads the latest score, so it
 * reports a failure — but the completion stands on the server, and taking the Next
 * link back would punish the student for practising. See `locked` below.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Blocks } from '@/components/Blocks';
import { ProgressBar } from '@/components/ProgressBar';
import { RequireRole } from '@/components/RequireRole';
import {
  Badge,
  ErrorNote,
  Loading,
  Page,
  Panel,
  btnPrimary,
  btnSecondary,
  muted,
} from '@/components/ui';
import * as api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { isStudent } from '@/lib/roles';
import { useAsync } from '@/lib/useAsync';
import { isEnrollmentActive } from '@/lib/types';

export default function LessonPage() {
  // Any account will do here; the predicate is what "signed in is enough" looks
  // like in this codebase.
  return (
    <RequireRole allow={[() => true]}>
      <LessonView />
    </RequireRole>
  );
}

function LessonView() {
  const params = useParams<{ id: string }>();
  const lessonId = params.id;
  const { token, user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useMemo(() => {
    if (!token) {
      return null;
    }

    return async () => {
      const lesson = await api.getLesson(lessonId, token);
      const courseId = lesson.course?.documentId ?? null;

      if (!courseId || !isStudent(user)) {
        return { lesson, courseId, enrolled: false, requestState: null, progress: null };
      }

      const enrollments = await api.listEnrollments(token);
      const enrollment = enrollments.find((row) => row.course?.documentId === courseId);
      const enrolled = isEnrollmentActive(enrollment);

      return {
        lesson,
        courseId,
        enrolled,
        // Kept so the page can say *why* the content is closed — a request waiting
        // on the instructor reads very differently from one that was declined.
        requestState: enrollment?.current_status ?? null,
        // Own progress is readable whether or not enrolled, and it carries the
        // sibling lessons this page uses for its previous/next links as well as
        // the quiz state for each.
        progress: await api.getCourseProgress(courseId, token),
      };
    };
  }, [lessonId, token, user]);

  const { data, error, loading, reload } = useAsync(load);

  const toggle = async () => {
    if (!token || !data) return;

    setSaving(true);
    setSaveError(null);

    try {
      const done = data.progress?.lessons.find((l) => l.documentId === lessonId)?.completed;

      if (done) {
        await api.uncompleteLesson(lessonId, token);
      } else {
        await api.completeLesson(lessonId, token);
      }

      reload();
    } catch (cause: unknown) {
      setSaveError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  // Keeps the previous render on screen while a reload is in flight, so toggling
  // completion does not blank the lesson out.
  if (loading && !data) {
    return (
      <Page title="Lesson">
        <Loading />
      </Page>
    );
  }

  if (error || !data) {
    return (
      <Page title="Lesson">
        <ErrorNote message={error ?? 'Lesson not found.'} onRetry={reload} />
      </Page>
    );
  }

  const { lesson, courseId, enrolled, requestState, progress } = data;
  const siblings = progress?.lessons ?? [];
  const index = siblings.findIndex((l) => l.documentId === lessonId);
  const previous = index > 0 ? siblings[index - 1] : null;
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null;
  const current = index >= 0 ? siblings[index] : null;
  const completed = current?.completed ?? false;

  // Whether the API withheld this lesson's body, and so whether to explain that
  // rather than render an empty `Blocks`.
  //
  // The `isStudent` half is what keeps authoring working: an instructor previewing
  // a lesson is not enrolled either, and the server sends them the full body.
  const withheld = isStudent(user) && !enrolled;

  // The quiz to show, and whether it locks this lesson.
  //
  // `progress` is the authority: it knows whether the quiz has questions and what
  // the student scored. The populated relation is only a fallback for a viewer with
  // no progress payload — an instructor previewing the lesson — who is not gated
  // anyway.
  const quizId = current?.quizId ?? lesson.quiz?.documentId ?? null;
  const quizRequired = current?.quizRequired ?? false;
  const quizPassed = current?.quizPassed ?? true;
  const quizScore = current?.quizScore ?? null;
  const passMark = progress?.quizPassMark ?? null;

  // Whether this lesson still stands between the student and the next one.
  //
  // `completed` belongs in here rather than being handled as an exception at each
  // use. `quizPassed` reports the *latest* score, so retaking a passed quiz and
  // doing worse flips it back to false — and that must not confiscate a lesson the
  // student already finished. The server agrees: it only accepted the completion
  // because the quiz was passed at the time, and it never takes one back.
  const locked = quizRequired && !quizPassed && !completed;

  /**
   * What to say about the quiz.
   *
   * Depends on completion as much as on the score, because the two can disagree: a
   * lesson is complete with a failing latest score whenever the student retook its
   * quiz after finishing it, and telling them to "take it again to unlock" a lesson
   * they have already done would be nonsense.
   */
  const quizNote = (() => {
    if (!quizRequired) {
      return 'This quiz has no questions yet, so it does not affect the lesson.';
    }

    if (quizScore === null) {
      return `Pass this quiz${
        passMark === null ? '' : ` with ${passMark}% or more`
      } to complete the lesson and move on.`;
    }

    const scored = `You scored ${quizScore}%`;
    const needed = passMark === null ? '' : `, and ${passMark}% is needed`;

    if (completed) {
      // Nothing here is a condition any more, whichever way the last attempt went.
      return quizPassed
        ? `${scored}. This lesson is complete — retaking the quiz cannot undo that.`
        : `${scored}${needed}. This lesson is already complete, so that stands.`;
    }

    return quizPassed
      ? `${scored}. This lesson is unlocked — mark it complete below.`
      : `${scored}${needed}. Take it again to unlock the lesson.`;
  })();

  return (
    <Page
      title={lesson.title}
      intro={
        lesson.course ? (
          <>
            Lesson {lesson.sequenceOrder ?? index + 1} of{' '}
            <Link href={`/courses/${courseId}`} className="underline">
              {lesson.course.title}
            </Link>
          </>
        ) : undefined
      }
      actions={completed ? <Badge tone="good">Completed</Badge> : undefined}
    >
      <div className="space-y-6">
        {progress ? (
          <Panel>
            <ProgressBar
              percent={progress.progressPercent}
              completed={progress.completedLessons}
              total={progress.totalLessons}
            />
          </Panel>
        ) : null}

        <Panel>
          {withheld ? (
            <>
              <p>This lesson&rsquo;s content is available once your enrolment is approved.</p>
              <p className={`mt-2 ${muted}`}>
                {requestState === 'pending'
                  ? 'Your request is with the instructor.'
                  : requestState === 'rejected'
                    ? 'Your request was declined, so the material stays closed.'
                    : 'Request enrolment from the course page to get started.'}
              </p>
              {courseId ? (
                <Link href={`/courses/${courseId}`} className={`${btnPrimary} mt-3`}>
                  Go to the course
                </Link>
              ) : null}
            </>
          ) : (
            <>
              {lesson.videoUrl ? (
                <p className="mb-4">
                  <a
                    href={lesson.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={btnSecondary}
                  >
                    Watch the video ↗
                  </a>
                </p>
              ) : null}

              <Blocks content={lesson.content} />
            </>
          )}
        </Panel>

        {quizId ? (
          <Panel
            title="Lesson quiz"
            action={
              quizRequired ? (
                <Badge tone={quizPassed ? 'good' : 'warn'}>
                  {quizPassed ? 'Passed' : 'Not passed yet'}
                </Badge>
              ) : null
            }
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className={muted}>
                {withheld
                  ? 'This lesson has a quiz. It opens once your enrolment is approved.'
                  : quizNote}
              </p>
              {/* No link while the content is withheld: the questions are withheld
                  with it, so the quiz page would have nothing to show. */}
              {withheld ? null : (
                <Link
                  href={`/quizzes/${quizId}`}
                  className={locked ? btnPrimary : btnSecondary}
                >
                  {quizScore === null ? 'Take the quiz' : 'Take it again'}
                </Link>
              )}
            </div>
          </Panel>
        ) : null}

        {isStudent(user) ? (
          <Panel>
            {enrolled ? (
              <>
                {saveError ? (
                  <div className="mb-3">
                    <ErrorNote message={saveError} />
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={toggle}
                    // `locked` already excludes a completed lesson, so un-completing
                    // stays available whatever the quiz says: it is the only route
                    // back from done, and the API allows it for the same reason.
                    disabled={saving || locked}
                    className={completed ? btnSecondary : btnPrimary}
                  >
                    {saving
                      ? 'Saving…'
                      : completed
                        ? 'Mark as not completed'
                        : 'Mark this lesson complete'}
                  </button>
                  <span className={muted}>
                    {locked
                      ? 'Pass the lesson quiz first.'
                      : 'The server recounts your progress on every change.'}
                  </span>
                </div>
              </>
            ) : (
              <p className={muted}>
                Completion is not tracked until your enrolment is approved.{' '}
                <Link href={`/courses/${courseId}`} className="underline">
                  Check its status on the course page
                </Link>
                .
              </p>
            )}
          </Panel>
        ) : null}

        {previous || next ? (
          <nav className="flex flex-wrap items-center justify-between gap-3">
            {previous ? (
              <Link href={`/lessons/${previous.documentId}`} className={btnSecondary}>
                ← {previous.title}
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              // Locked only by *this* lesson's quiz, so lessons without one navigate
              // exactly as they did before.
              locked ? (
                <span
                  className={`${btnSecondary} cursor-not-allowed opacity-50`}
                  aria-disabled="true"
                  title="Pass this lesson's quiz to continue."
                >
                  {next.title} →
                </span>
              ) : (
                <Link href={`/lessons/${next.documentId}`} className={btnSecondary}>
                  {next.title} →
                </Link>
              )
            ) : null}
          </nav>
        ) : null}
      </div>
    </Page>
  );
}
