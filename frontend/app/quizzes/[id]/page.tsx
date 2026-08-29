'use client';

/**
 * One quiz.
 *
 * Which of the two course relations is populated is what makes a quiz final or
 * practice — there is no flag on the quiz itself — so this page reads `course`
 * (final) and `parent_course` (practice) and labels itself from whichever is set.
 *
 * Only an enrolled student can submit. Everyone else who can read a quiz sees the
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
import type { QuizSubmission } from '@/lib/types';

const optionsOf = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.map((option) => String(option)) : [];

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
      const isFinal = Boolean(quiz.course);
      const courseId = quiz.course?.documentId ?? quiz.parent_course?.documentId ?? null;
      const courseTitle = quiz.course?.title ?? quiz.parent_course?.title ?? null;

      if (!courseId || !isStudent(user)) {
        return { quiz, isFinal, courseId, courseTitle, enrolled: false, progress: null };
      }

      const enrollments = await api.listEnrollments(token);

      return {
        quiz,
        isFinal,
        courseId,
        courseTitle,
        enrolled: enrollments.some((e) => e.course?.documentId === courseId),
        progress: await api.getCourseProgress(courseId, token),
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

  const { quiz, isFinal, courseId, courseTitle, enrolled, progress } = data;
  const questions = quiz.Question ?? [];
  const storedScore = justGraded?.recorded
    ? justGraded.score
    : progress?.finalQuiz?.attempted
      ? progress.finalQuiz.latestScore
      : null;

  return (
    <Page
      title={isFinal ? 'Final quiz' : 'Practice quiz'}
      intro={
        courseId ? (
          <>
            {isFinal
              ? 'Graded and recorded — your latest score is the one that counts. '
              : 'Scored for feedback; nothing is recorded. '}
            Part of{' '}
            <Link href={`/courses/${courseId}`} className="underline">
              {courseTitle ?? 'the course'}
            </Link>
            .
          </>
        ) : (
          'This quiz is not linked to a course, so it cannot be graded.'
        )
      }
      actions={<Badge tone={isFinal ? 'neutral' : 'good'}>{isFinal ? 'Graded' : 'Practice'}</Badge>}
    >
      <div className="space-y-6">
        {isFinal && storedScore !== null ? (
          <Panel title="Your recorded grade">
            <p className="text-3xl font-semibold tabular-nums">{storedScore}%</p>
            <p className={`mt-1 ${muted}`}>Retaking the quiz replaces this score.</p>
          </Panel>
        ) : null}

        {isStudent(user) && !enrolled ? (
          <Panel>
            <p className={muted}>
              You must be enrolled in this course to submit answers.
            </p>
            {courseId ? (
              <Link href={`/courses/${courseId}`} className={`${btnPrimary} mt-3`}>
                Go to the course
              </Link>
            ) : null}
          </Panel>
        ) : null}

        {questions.length === 0 ? (
          <Empty>This quiz has no questions yet.</Empty>
        ) : isStudent(user) && enrolled && token ? (
          <QuizRunner
            quiz={quiz}
            token={token}
            isFinal={isFinal}
            onGraded={setJustGraded}
          />
        ) : (
          /* Read-only view: the questions as authored, with no way to submit.
             Instructors and editors land here — useful for checking a quiz reads
             correctly, and it cannot leak the key, which never left the server. */
          <Panel title={`Questions (${questions.length})`}>
            <p className={`mb-4 ${muted}`}>
              {isStudent(user)
                ? 'Enrol to answer these.'
                : 'Only students can submit attempts, so this is a preview. The correct answers are private to the API and are not in this response.'}
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
