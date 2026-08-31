'use client';

/**
 * Writing a quiz's questions — the only screen in this app that shows an answer key.
 *
 * One page serves all three kinds of quiz, because a quiz has no type of its own:
 * which relation is set is what makes it a lesson gate, a final, or practice. The
 * URL names either a *slot*, which may still be empty, or an existing quiz:
 *
 *   * `?lesson=<lessonDocumentId>` — the quiz gating that lesson
 *   * `?kind=final`               — this course's final quiz
 *   * `?kind=practice`            — a new practice quiz (always new; there can be many)
 *   * `?quiz=<documentId>`        — that quiz, whatever kind it turns out to be
 *
 * The key arrives from `GET /api/quizzes/:id/manage` and nowhere else:
 * `correctOptionIndex` is `private`, so every ordinary read strips it. Without that
 * endpoint an author would open a quiz with every answer blank and wipe the key on
 * the first save. `private` is output-only in Strapi 5, so the same field is
 * perfectly writable — which is why saving needs no special endpoint at all.
 *
 * Everything here is gated server-side by `can-manage-quiz` on the reads and the
 * writes, and by `can-manage-course` on setting the final quiz. So a content
 * manager or admin may author for any course and an instructor only for their own,
 * whatever this page renders.
 *
 * The question list is held as an *override*, the same way the course editor holds
 * its fields: `draft` is null until the author touches something, and until then the
 * loaded questions are what render. That keeps fetched data out of state — copying
 * it in from an effect is an error under `react-hooks/set-state-in-effect` — and
 * makes "discard" and "saved" the same operation: clear the override.
 */

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { RequireRole } from '@/components/RequireRole';
import {
  Badge,
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
import { canAuthorContent } from '@/lib/roles';
import { useAsync } from '@/lib/useAsync';
import type { QuizQuestionDraft } from '@/lib/types';

export default function QuizEditorPage() {
  return (
    <RequireRole allow={[canAuthorContent]}>
      {/* `useSearchParams` bails out of prerendering up to the nearest boundary, and
          a static route that calls it without one fails the production build. */}
      <Suspense
        fallback={
          <Page title="Quiz">
            <Loading />
          </Page>
        }
      >
        <QuizEditor />
      </Suspense>
    </RequireRole>
  );
}

/** Which of the three a quiz is. Derived, never stored — see the file comment. */
type Kind = 'lesson' | 'final' | 'practice';

const blankQuestion = (): QuizQuestionDraft => ({
  questionText: '',
  // Two, because that is the minimum the server accepts — a "quiz" with one
  // option per question has no wrong answer.
  options: ['', ''],
  correctOptionIndex: null,
});

/**
 * Mirrors `questionProblem` in `backend/src/api/quiz/controllers/quiz.ts` so a
 * mistake is named before the round trip. The server re-checks and is the
 * authority; this is a courtesy, not the guard.
 *
 * It is stricter in one place: the server accepts an empty question list, since
 * emptying a quiz is a legitimate edit, but creating one that way is never what an
 * author meant. Detaching a quiz from a lesson is done in the course editor.
 */
const problemWith = (questions: QuizQuestionDraft[]): string | null => {
  if (questions.length === 0) {
    return 'Add at least one question.';
  }

  for (const [index, question] of questions.entries()) {
    const at = `Question ${index + 1}`;

    if (question.questionText.trim() === '') {
      return `${at} has no text.`;
    }

    if (question.options.length < 2) {
      return `${at} needs at least two options.`;
    }

    if (question.options.some((option) => option.trim() === '')) {
      return `${at} has a blank option.`;
    }

    if (question.correctOptionIndex === null) {
      return `${at} does not mark which option is correct.`;
    }
  }

  return null;
};

function QuizEditor() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { token } = useAuth();

  const courseId = params.id;
  // `|| null` rather than `?? null`: `?quiz=` with no value reads as '', which
  // names nothing.
  const quizId = search.get('quiz') || null;
  const lessonId = search.get('lesson') || null;
  const kindParam = search.get('kind');

  /** The edited question list, or null while the author has changed nothing. */
  const [draft, setDraft] = useState<QuizQuestionDraft[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useMemo(() => {
    if (!token) {
      return null;
    }

    return async () => {
      // The course answers three questions at once: its title, which lesson the
      // `?lesson=` form means, and whether the slot named by the URL is already
      // filled. Each lesson arrives with its `quiz`, so no extra request is needed
      // to find out.
      const course = await api.getCourse(courseId, token);
      const lesson = lessonId
        ? ((course.lessons ?? []).find((candidate) => candidate.documentId === lessonId) ??
          null)
        : null;

      const existingId =
        quizId ??
        (lessonId ? (lesson?.quiz?.documentId ?? null) : null) ??
        (kindParam === 'final' ? (course.final_quiz?.documentId ?? null) : null);

      // `manage` is the only read that returns the answer key.
      const managed = existingId ? await api.getManagedQuiz(existingId, token) : null;

      return { course, lesson, managed };
    };
  }, [courseId, token, lessonId, quizId, kindParam]);

  const { data, error, loading, reload } = useAsync(load);

  const backHref = `/dashboard/instructor/courses/${courseId}/edit`;

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
        <ErrorNote message={error ?? 'Course not found.'} onRetry={reload} />
      </Page>
    );
  }

  const { course, lesson, managed } = data;

  // A `?lesson=` from somewhere else would otherwise create a quiz on a lesson
  // this page is not editing. The server would still check the lesson's own course,
  // but the resulting quiz would be invisible from here.
  if (lessonId && !lesson) {
    return (
      <Page title="Quiz" actions={<Link href={backHref} className={btnSecondary}>Back</Link>}>
        <ErrorNote message={`That lesson is not part of “${course.title}”.`} />
      </Page>
    );
  }

  const kind: Kind = managed
    ? managed.isLesson
      ? 'lesson'
      : managed.isFinal
        ? 'final'
        : 'practice'
    : lessonId
      ? 'lesson'
      : kindParam === 'final'
        ? 'final'
        : 'practice';

  const questions = draft ?? managed?.questions ?? [];
  const dirty = draft !== null;

  const setQuestions = (next: QuizQuestionDraft[]) => {
    setDraft(next);
    setSaveError(null);
  };

  const patch = (index: number, change: Partial<QuizQuestionDraft>) =>
    setQuestions(
      questions.map((question, at) => (at === index ? { ...question, ...change } : question))
    );

  const move = (index: number, by: -1 | 1) => {
    const target = index + by;

    if (target < 0 || target >= questions.length) {
      return;
    }

    const next = [...questions];
    [next[index], next[target]] = [next[target], next[index]];
    // Each question's key is an index into its *own* options, so reordering
    // questions leaves every answer where it was.
    setQuestions(next);
  };

  const removeOption = (questionIndex: number, optionIndex: number) => {
    const question = questions[questionIndex];
    const key = question.correctOptionIndex;

    patch(questionIndex, {
      options: question.options.filter((_, at) => at !== optionIndex),
      // The key is an index into the list that just shrank: the removed option is
      // no longer the answer, and everything after it moved down one.
      correctOptionIndex:
        key === null || key === optionIndex ? null : key > optionIndex ? key - 1 : key,
    });
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!token) return;

    const problem = problemWith(questions);

    if (problem) {
      setSaveError(problem);
      return;
    }

    // Stored trimmed. The server only rejects blank text, it does not tidy it.
    const payload: QuizQuestionDraft[] = questions.map((question) => ({
      questionText: question.questionText.trim(),
      options: question.options.map((option) => option.trim()),
      correctOptionIndex: question.correctOptionIndex,
    }));

    setSaving(true);
    setSaveError(null);

    try {
      if (managed) {
        await api.saveQuizQuestions(managed.documentId, payload, token);
        setDraft(null);
        reload();
      } else {
        // Which relation gets set is what decides the kind, and only the final
        // quiz needs two calls — `Course.final_quiz` is the owning side of that
        // relation, so it is written from the course. `createFinalQuiz` hides that.
        const created = lessonId
          ? await api.createLessonQuiz(lessonId, payload, token)
          : kind === 'final'
            ? await api.createFinalQuiz(courseId, payload, token)
            : await api.createPracticeQuiz(courseId, payload, token);

        setDraft(null);
        // The quiz now exists, so the URL names it outright. Reloading this page
        // then reads the saved key back instead of starting from a blank slot —
        // and `?kind=practice` would otherwise open a second new quiz.
        router.replace(
          `/dashboard/instructor/courses/${courseId}/quiz?quiz=${created.documentId}`
        );
      }
    } catch (cause: unknown) {
      setSaveError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const heading =
    kind === 'lesson'
      ? `Lesson quiz: ${lesson?.title ?? managed?.lesson?.title ?? 'lesson'}`
      : kind === 'final'
        ? `Final quiz: ${course.title}`
        : `Practice quiz: ${course.title}`;

  const intro =
    kind === 'lesson'
      ? 'Students must pass this before they can complete the lesson or move to the next one.'
      : kind === 'final'
        ? 'Taken at the end of the course. The latest score is recorded on the student’s transcript.'
        : 'Practice is scored on screen and nothing is stored — it gates nothing.';

  return (
    <Page
      title={heading}
      intro={intro}
      actions={
        <>
          <Link href={backHref} className={btnSecondary}>
            Back
          </Link>
          <Link href={`/courses/${courseId}`} className={btnSecondary}>
            View course
          </Link>
        </>
      }
    >
      <form onSubmit={save} className="space-y-6">
        <Panel
          title={`Questions (${questions.length})`}
          action={
            <div className="flex items-center gap-2">
              {managed ? <Badge tone="good">Saved</Badge> : <Badge tone="warn">Not created yet</Badge>}
              {dirty ? <Badge tone="warn">Unsaved</Badge> : null}
            </div>
          }
        >
          <p className={`mb-4 ${muted}`}>
            The marked option is the answer key. It is stored <em>private</em>, so it is
            never sent to a student&apos;s browser — grading happens on the server, and
            this page is the only place it is readable.
          </p>

          {questions.length === 0 ? (
            <p className={`mb-4 ${muted}`}>No questions yet.</p>
          ) : (
            <ol className="space-y-4">
              {questions.map((question, questionIndex) => (
                // Index keys: a question has no id of its own until it is saved, and
                // every field here is controlled, so a reorder re-renders values into
                // the same nodes rather than relying on identity.
                <li key={questionIndex} className={card}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Question {questionIndex + 1}</h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => move(questionIndex, -1)}
                        disabled={questionIndex === 0 || saving}
                        className={btnSecondary}
                        aria-label={`Move question ${questionIndex + 1} up`}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => move(questionIndex, 1)}
                        disabled={questionIndex === questions.length - 1 || saving}
                        className={btnSecondary}
                        aria-label={`Move question ${questionIndex + 1} down`}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setQuestions(questions.filter((_, at) => at !== questionIndex))
                        }
                        disabled={saving}
                        className={btnSecondary}
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className={label} htmlFor={`question-${questionIndex}`}>
                        Question
                      </label>
                      <textarea
                        id={`question-${questionIndex}`}
                        className={`${input} min-h-20`}
                        value={question.questionText}
                        onChange={(event) =>
                          patch(questionIndex, { questionText: event.target.value })
                        }
                      />
                    </div>

                    <fieldset>
                      <legend className={label}>Options — select the correct one</legend>
                      <div className="space-y-2">
                        {question.options.map((option, optionIndex) => (
                          <div key={optionIndex} className="flex items-center gap-3">
                            <input
                              type="radio"
                              // Grouped per question, so marking an answer in one
                              // does not clear another's.
                              name={`correct-${questionIndex}`}
                              checked={question.correctOptionIndex === optionIndex}
                              onChange={() =>
                                patch(questionIndex, { correctOptionIndex: optionIndex })
                              }
                              className="size-4 shrink-0"
                              aria-label={`Option ${optionIndex + 1} of question ${questionIndex + 1} is correct`}
                            />
                            <input
                              className={input}
                              value={option}
                              placeholder={`Option ${optionIndex + 1}`}
                              onChange={(event) =>
                                patch(questionIndex, {
                                  options: question.options.map((current, at) =>
                                    at === optionIndex ? event.target.value : current
                                  ),
                                })
                              }
                              aria-label={`Option ${optionIndex + 1} of question ${questionIndex + 1}`}
                            />
                            <button
                              type="button"
                              onClick={() => removeOption(questionIndex, optionIndex)}
                              // Two is the minimum the server accepts.
                              disabled={question.options.length <= 2 || saving}
                              className={`${btnSecondary} shrink-0`}
                              aria-label={`Remove option ${optionIndex + 1} of question ${questionIndex + 1}`}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          patch(questionIndex, { options: [...question.options, ''] })
                        }
                        disabled={saving}
                        className={`${btnSecondary} mt-3`}
                      >
                        Add an option
                      </button>
                    </fieldset>
                  </div>
                </li>
              ))}
            </ol>
          )}

          <button
            type="button"
            onClick={() => setQuestions([...questions, blankQuestion()])}
            disabled={saving}
            className={`${btnSecondary} mt-4`}
          >
            Add a question
          </button>
        </Panel>

        {saveError ? <ErrorNote message={saveError} /> : null}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={saving || (managed !== null && !dirty)} className={btnPrimary}>
            {saving ? 'Saving…' : managed ? 'Save questions' : 'Create quiz'}
          </button>
          {dirty && !saving ? (
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                setSaveError(null);
              }}
              className={btnSecondary}
            >
              Discard changes
            </button>
          ) : null}
          {kind === 'practice' && !managed ? (
            <p className={muted}>
              Saving creates a new practice quiz on this course.
            </p>
          ) : null}
        </div>
      </form>
    </Page>
  );
}
