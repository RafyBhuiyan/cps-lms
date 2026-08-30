'use client';

/**
 * Takes a quiz and submits it for grading.
 *
 * The answer key is never here. `correctOptionIndex` is `private` in the schema,
 * so the questions arrive without it; this component posts the chosen option
 * indexes to `POST /api/quizzes/:id/submit` and the server returns the score and
 * which questions were wrong. That is the whole point of the design — a client
 * that cannot see the answers cannot grade itself, and cannot be made to lie
 * about the result either.
 */

import { useMemo, useState } from 'react';
import * as api from '@/lib/api';
import type { Quiz, QuizSubmission } from '@/lib/types';
import { Badge, ErrorNote, btnPrimary, card, muted } from './ui';

/** `options` is a `json` column, so its shape is only a convention. */
const optionsOf = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.map((option) => String(option)) : [];

export function QuizRunner({
  quiz,
  token,
  isFinal,
  onGraded,
}: {
  quiz: Quiz;
  token: string;
  isFinal: boolean;
  /** Lets the surrounding page refresh a grade or progress figure it displays. */
  onGraded?: (submission: QuizSubmission) => void;
}) {
  const questions = useMemo(() => quiz.Question ?? [], [quiz]);
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null));
  const [result, setResult] = useState<QuizSubmission | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const unanswered = answers.filter((answer) => answer === null).length;

  const choose = (questionIndex: number, optionIndex: number) =>
    setAnswers((current) =>
      current.map((answer, index) => (index === questionIndex ? optionIndex : answer))
    );

  const submit = async () => {
    setSubmitting(true);
    setError(null);

    try {
      // The API requires exactly one entry per question; null means skipped.
      const submission = await api.submitQuiz(quiz.documentId, answers, token);
      setResult(submission);
      onGraded?.(submission);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSubmitting(false);
    }
  };

  const retake = () => {
    setResult(null);
    setError(null);
    setAnswers(questions.map(() => null));
  };

  if (questions.length === 0) {
    return <p className={muted}>This quiz has no questions yet.</p>;
  }

  const verdictFor = (index: number) =>
    result?.results.find((entry) => entry.questionIndex === index)?.correct ?? null;

  return (
    <div className="space-y-5">
      {result ? (
        <div className={card}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-3xl font-semibold tabular-nums">{result.score}%</p>
            <p className={muted}>
              {result.correctCount} of {result.totalQuestions} correct
            </p>
          </div>
          <p className={`mt-3 ${muted}`}>
            {result.recorded
              ? 'Recorded as your grade for this course. Retaking replaces it with the latest score.'
              : 'Practice quiz — scored for feedback only, nothing is recorded.'}
          </p>
          {/* A lesson quiz is the one kind whose score decides something beyond the
              grade book, and the score alone does not say which way it went. Both
              figures come from the server's own verdict, not from comparing them here. */}
          {result.isLesson ? (
            <p className={`mt-2 font-medium ${result.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
              {result.passed
                ? 'You passed — the lesson is unlocked. Go back to it to mark it complete.'
                : `${result.passMark}% is needed to unlock the lesson. Try again.`}
            </p>
          ) : null}
        </div>
      ) : null}

      <ol className="space-y-5">
        {questions.map((question, index) => {
          const options = optionsOf(question.options);
          const verdict = verdictFor(index);

          return (
            <li key={question.id ?? index} className={card}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <p className="font-medium">
                  <span className={`mr-2 ${muted}`}>{index + 1}.</span>
                  {question.questionText ?? 'Untitled question'}
                </p>
                {verdict === null ? null : verdict ? (
                  <Badge tone="good">Correct</Badge>
                ) : (
                  <Badge tone="warn">Wrong</Badge>
                )}
              </div>

              <div className="space-y-2">
                {options.map((option, optionIndex) => (
                  <label
                    key={optionIndex}
                    className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm ${
                      answers[index] === optionIndex
                        ? 'border-zinc-500 bg-black/[.03] dark:bg-white/[.06]'
                        : 'border-black/10 dark:border-white/15'
                    } ${result ? 'cursor-default' : ''}`}
                  >
                    <input
                      type="radio"
                      name={`question-${index}`}
                      checked={answers[index] === optionIndex}
                      onChange={() => choose(index, optionIndex)}
                      // Locked after grading: the displayed verdicts belong to the
                      // answers that were actually submitted.
                      disabled={result !== null}
                      className="accent-zinc-900 dark:accent-zinc-100"
                    />
                    <span>{option}</span>
                  </label>
                ))}
                {options.length === 0 ? (
                  <p className={muted}>This question has no options recorded.</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {error ? <ErrorNote message={error} /> : null}

      <div className="flex flex-wrap items-center gap-3">
        {result ? (
          <button type="button" onClick={retake} className={btnPrimary}>
            {isFinal ? 'Retake (replaces your grade)' : 'Try again'}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className={btnPrimary}
            >
              {submitting ? 'Grading…' : 'Submit for grading'}
            </button>
            {unanswered > 0 ? (
              <span className={muted}>
                {unanswered} unanswered — skipped questions count as wrong.
              </span>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
