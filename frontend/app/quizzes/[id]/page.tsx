'use client';

/**
 * One quiz.
 *
 * There is no flag on a quiz saying what it is for — which relation is populated
 * is the whole of it: `course` makes it a course's final quiz, `lesson` makes it
 * the quiz gating that lesson, and `parent_course` makes it practice. This page
 * labels itself from whichever is set.
 *
 * The `lesson` case is the one that needs care. It is the only kind with no course
 * relation of its own, so its course has to be reached through `lesson.course`;
 * read without that hop it looks like a quiz belonging to nothing, which this page
 * would report as ungradeable and offer no answer form for.
 *
 * Only an approved student can submit. Everyone else who can read a quiz sees the
 * questions without the answer form; the API would refuse their submission anyway,
 * and the correct answers are `private` in the schema so they are absent from this
 * response for every caller, including an admin.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { QuizRunner } from '@/components/QuizRunner';
import { RequireRole } from '@/components/RequireRole';
import {
  Badge,
  Empty,
  ErrorNote,
  Loading,
  Page,
  Panel,
  btnPrimary,
  card,
  muted,
} from '@/components/ui';
import * as api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { isStudent } from '@/lib/roles';
import { useAsync } from '@/lib/useAsync';
import { isEnrollmentActive, type QuizSubmission } from '@/lib/types';

const optionsOf = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.map((option) => String(option)) : [];

/** What the quiz is for. Decided by its relations; see the note at the top. */
type QuizKind = 'final' | 'lesson' | 'practice';

export default function QuizPage() {
  return (
    <RequireRole allow={[() => true]}>
      <QuizView />
    </RequireRole>
  );
}

function QuizView() {
  const params = useParams<{ id: string }>();
  const quizId = params.id;
  const { token, user } = useAuth();
  // Set when a submission is graded in this session, so the recorded grade shown
  // above the quiz matches what just happened without a refetch.
  const [justGraded, setJustGraded] = useState<QuizSubmission | null>(null);

  const load = useMemo(() => {
    if (!token) {
      return null;
    }

    return async () => {
      const quiz = await api.getQuiz(quizId, token);
      const kind: QuizKind = quiz.course ? 'final' : quiz.lesson ? 'lesson' : 'practice';
      // `lesson.course` is populated by `getQuiz` for exactly this: it is the only
      // route from a lesson quiz to the course it is graded against.
      const course = quiz.course ?? quiz.lesson?.course ?? quiz.parent_course ?? null;
      const courseId = course?.documentId ?? null;
      const courseTitle = course?.title ?? null;

      if (!courseId || !isStudent(user)) {
        return { quiz, kind, courseId, courseTitle, enrolled: false, progress: null };
      }

      const enrollment =
        (await api.listEnrollments(token)).find((row) => row.course?.documentId === courseId) ??
        null;

      // A pending or declined request is not enrolment. Showing the answer form to
      // one would only earn a 403 from the API on submit.
      const enrolled = isEnrollmentActive(enrollment);

      return {
        quiz,
        kind,
        courseId,
        courseTitle,
        enrolled,
        progress: enrolled ? await api.getCourseProgress(courseId, token) : null,
      };
    };
  }, [quizId, token, user]);

  const { data, error, loading, reload } = useAsync(load);

  if (loading && !data) {
    return (
      <Page title="Quiz">
        <Loading />
      </Page>
    );
  }

  if (error || !data) {
    return (
      <Page title="Quiz">
        <ErrorNote message={error ?? 'Quiz not found.'} onRetry={reload} />
      </Page>
    );
  }

  const { quiz, kind, courseId, courseTitle, enrolled, progress } = data;
  const questions = quiz.Question ?? [];

  // Whether the API withheld the questions. A student without an active enrolment
  // gets none, so there is nothing to render and nothing to submit — the panel
  // below explains that instead. Staff are never withheld: they need the preview.
  const withheld = isStudent(user) && !enrolled;

  /** This quiz's entry in the progress payload, for a lesson quiz. */
  const gatedLesson =
    kind === 'lesson'
      ? (progress?.lessons.find((entry) => entry.quizId === quiz.documentId) ?? null)
      : null;

  // A lesson quiz is recorded just like a final one, so both have a stored score to
  // show; only practice quizzes have nothing behind them.
  const storedScore = justGraded?.recorded
    ? justGraded.score
    : kind === 'final'
      ? progress?.finalQuiz?.attempted
        ? progress.finalQuiz.latestScore
        : null
      : (gatedLesson?.quizScore ?? null);

  const title =
    kind === 'final' ? 'Final quiz' : kind === 'lesson' ? 'Lesson quiz' : 'Practice quiz';

  return (
    <Page
      title={title}
      intro={
        courseId ? (
          <>
            {kind === 'final'
              ? 'Graded and recorded — your latest score is the one that counts. '
              : kind === 'lesson'
                ? // The pass mark comes from the progress payload, which reads it from
                  // the server's one constant; it is never written down in this app.
                  `Pass it${progress ? ` with ${progress.quizPassMark}% or more` : ''} to complete its lesson and move on. Your latest score counts. `
                : 'Scored for feedback; nothing is recorded. '}
            Part of{' '}
            <Link href={`/courses/${courseId}`} className="underline">
              {courseTitle ?? 'the course'}
            </Link>
            {quiz.lesson ? (
              <>
                , gating{' '}
                <Link href={`/lessons/${quiz.lesson.documentId}`} className="underline">
                  {quiz.lesson.title}
                </Link>
              </>
            ) : null}
            .
          </>
        ) : (
          'This quiz is not linked to a course, so it cannot be graded.'
        )
      }
      actions={
        <Badge tone={kind === 'final' ? 'neutral' : kind === 'lesson' ? 'warn' : 'good'}>
          {kind === 'final' ? 'Graded' : kind === 'lesson' ? 'Required' : 'Practice'}
        </Badge>
      }
    >
      <div className="space-y-6">
        {kind !== 'practice' && storedScore !== null ? (
          <Panel title="Your recorded grade">
            <p className="text-3xl font-semibold tabular-nums">{storedScore}%</p>
            <p className={`mt-1 ${muted}`}>Retaking the quiz replaces this score.</p>
          </Panel>
        ) : null}

        {isStudent(user) && !enrolled ? (
          <Panel>
            <p className={muted}>
              You must be enrolled in this course, and your request approved, to submit
              answers.
            </p>
            {courseId ? (
              <Link href={`/courses/${courseId}`} className={`${btnPrimary} mt-3`}>
                Go to the course
              </Link>
            ) : null}
          </Panel>
        ) : null}

        {withheld ? (
          /* Nothing where the questions were. The API withheld them, and saying
             "no questions yet" here would blame the instructor for the gate — so
             the enrolment panel above is the whole answer. */
          null
        ) : questions.length === 0 ? (
          <Empty>This quiz has no questions yet.</Empty>
        ) : isStudent(user) && enrolled && token ? (
          <QuizRunner
            quiz={quiz}
            token={token}
            isFinal={kind === 'final'}
            onGraded={setJustGraded}
          />
        ) : (
          /* Read-only view: the questions as authored, with no way to submit. Only
             instructors and editors reach it — useful for checking a quiz reads
             correctly, and it cannot leak the key, which never left the server. */
          <Panel title={`Questions (${questions.length})`}>
            <p className={`mb-4 ${muted}`}>
              Only students can submit attempts, so this is a preview. The correct
              answers are private to the API and are not in this response.
            </p>
            <ol className="space-y-4">
              {questions.map((question, index) => (
                <li key={question.id ?? index} className={card}>
                  <p className="font-medium">
                    <span className={`mr-2 ${muted}`}>{index + 1}.</span>
                    {question.questionText ?? 'Untitled question'}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {optionsOf(question.options).map((option, optionIndex) => (
                      <li key={optionIndex} className={muted}>
                        {String.fromCharCode(65 + optionIndex)}. {option}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </Panel>
        )}
      </div>
    </Page>
  );
}
