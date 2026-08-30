'use client';

/**
 * Authoring one course: its own fields, and its lessons.
 *
 * Everything here is gated server-side as well as by the role check below —
 * `can-manage-course` on the course write and `can-manage-lesson` on every lesson
 * write, which also refuses a lesson pointed at a course the caller does not
 * manage. So a content manager sees this page for any course, an instructor only
 * for their own, and neither can talk the API into more than that.
 *
 * Two deliberate omissions:
 *
 *   * **The slug is not editable.** It is the course's URL, and the API only ever
 *     fills it on create.
 *   * **Quiz questions are not written here.** This page attaches an existing quiz
 *     to a lesson; the questions and their answer keys live in the Strapi admin,
 *     where the answer key can be kept `private` and the repeatable-component
 *     editor does a far better job than a form in this app would.
 *
 * Form state is held as *overrides* — a field the author has not touched is absent
 * and reads straight from the loaded course — so a save can simply clear the
 * overrides and let the reloaded data show through. That avoids copying fetched
 * data into state from an effect, which this codebase treats as an error.
 */

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
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
  input,
  label,
  muted,
} from '@/components/ui';
import * as api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fromBlocks, toBlocks } from '@/lib/blocks';
import { canAuthorContent, isAdmin } from '@/lib/roles';
import { useAsync } from '@/lib/useAsync';
import type { Lesson, Quiz } from '@/lib/types';

export default function CourseEditPage() {
  return (
    <RequireRole allow={[canAuthorContent]}>
      <CourseEdit />
    </RequireRole>
  );
}

/** What the lesson form holds. Numbers are kept as strings so a field can be empty. */
type LessonForm = {
  title: string;
  videoUrl: string;
  sequenceOrder: string;
  body: string;
  /** A quiz documentId, or `''` for none. */
  quizId: string;
};

/**
 * A quiz has no title, so it is identified by its numeric id, its size, and what
 * it is currently attached to — the last of which is the point: picking a quiz
 * already on another lesson moves it, and an author should see that first.
 */
const quizLabel = (quiz: Quiz): string => {
  const count = quiz.Question?.length ?? 0;
  const attached = quiz.lesson
    ? `on lesson “${quiz.lesson.title}”`
    : quiz.course
      ? `final quiz of “${quiz.course.title}”`
      : quiz.parent_course
        ? `practice quiz of “${quiz.parent_course.title}”`
        : 'not attached';

  return `#${quiz.id} · ${count} question${count === 1 ? '' : 's'} · ${attached}`;
};

function CourseEdit() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const courseId = params.id;
  const { token, user } = useAuth();

  /** Only the course fields the author has typed into. */
  const [courseEdits, setCourseEdits] = useState<{
    title?: string;
    description?: string;
    coverUrl?: string;
  }>({});
  const [savingCourse, setSavingCourse] = useState(false);
  const [courseError, setCourseError] = useState<string | null>(null);

  /**
   * The open lesson form, or null when none is. `id: null` means a new lesson —
   * one piece of state rather than two, so "adding" and "editing an existing one"
   * cannot both be true.
   */
  const [editing, setEditing] = useState<{ id: string | null; form: LessonForm } | null>(
    null
  );
  const [savingLesson, setSavingLesson] = useState(false);
  const [lessonError, setLessonError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useMemo(() => {
    if (!token) {
      return null;
    }

    return async () => {
      const [course, quizzes] = await Promise.all([
        api.getCourse(courseId, token),
        api.listQuizzes(token),
      ]);

      return { course, quizzes };
    };
  }, [courseId, token]);

  const { data, error, loading, reload } = useAsync(load);

  const saveCourse = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!token || !data) return;

    setSavingCourse(true);
    setCourseError(null);

    try {
      await api.updateCourse(
        courseId,
        {
          title: (courseEdits.title ?? data.course.title).trim(),
          description: (courseEdits.description ?? data.course.description ?? '').trim(),
          // An empty box means "no cover", which is null rather than an empty string.
          coverUrl: (courseEdits.coverUrl ?? data.course.coverUrl ?? '').trim() || null,
        },
        token
      );
      setCourseEdits({});
      reload();
    } catch (cause: unknown) {
      setCourseError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSavingCourse(false);
    }
  };

  const removeCourse = async () => {
    if (!token) return;

    if (!window.confirm(`Delete “${data?.course.title ?? 'this course'}”? This removes the course and all of its lessons.`)) {
      return;
    }

    try {
      await api.deleteCourse(courseId, token);
      router.push(isAdmin(user) ? '/dashboard/admin' : '/dashboard/instructor');
    } catch (cause: unknown) {
      setCourseError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const saveLesson = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!token || !editing) return;

    const { form } = editing;
    const order = form.sequenceOrder.trim();

    if (order !== '' && !Number.isInteger(Number(order))) {
      setLessonError('Order must be a whole number, or left empty.');
      return;
    }

    setSavingLesson(true);
    setLessonError(null);

    const draft: api.LessonDraft = {
      title: form.title.trim(),
      content: toBlocks(form.body),
      videoUrl: form.videoUrl.trim() || null,
      sequenceOrder: order === '' ? null : Number(order),
      // `''` detaches whatever was attached; the relation is one quiz per lesson.
      quiz: form.quizId || null,
    };

    try {
      if (editing.id) {
        await api.updateLesson(editing.id, draft, token);
      } else {
        await api.createLesson({ ...draft, course: courseId }, token);
      }

      setEditing(null);
      reload();
    } catch (cause: unknown) {
      setLessonError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSavingLesson(false);
    }
  };

  const removeLesson = async (lesson: Lesson) => {
    if (!token) return;

    // Deleting a lesson takes every student's progress row on it with it, which is
    // worth one click of friction.
    if (
      !window.confirm(
        `Delete “${lesson.title}”? Any completion your students recorded on it goes too.`
      )
    ) {
      return;
    }

    setDeleting(lesson.documentId);
    setLessonError(null);

    try {
      await api.deleteLesson(lesson.documentId, token);

      if (editing?.id === lesson.documentId) {
        setEditing(null);
      }

      reload();
    } catch (cause: unknown) {
      setLessonError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setDeleting(null);
    }
  };

  if (loading && !data) {
    return (
      <Page title="Edit course">
        <Loading />
      </Page>
    );
  }

  if (error || !data) {
    return (
      <Page title="Edit course">
        <ErrorNote message={error ?? 'Course not found.'} onRetry={reload} />
      </Page>
    );
  }

  const { course, quizzes } = data;
  const lessons = [...(course.lessons ?? [])].sort(
    (a, b) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0)
  );

  /**
   * The full record for each quiz, by documentId.
   *
   * Needed because the course populate stops at the lesson's `quiz`: that copy
   * arrives with scalars only — no `Question` component and none of its own
   * relations. Deepening the populate would slow the course page down for a fact
   * only this page uses, and the full list is already here for the picker, so the
   * rows below resolve through this instead.
   */
  const quizById = new Map(quizzes.map((quiz) => [quiz.documentId, quiz]));

  const titleValue = courseEdits.title ?? course.title;
  const descriptionValue = courseEdits.description ?? course.description ?? '';
  const coverValue = courseEdits.coverUrl ?? course.coverUrl ?? '';
  const courseDirty = Object.keys(courseEdits).length > 0;

  /** Where a new lesson goes: after the last one. */
  const nextOrder =
    lessons.reduce((highest, lesson) => Math.max(highest, lesson.sequenceOrder ?? 0), 0) + 1;

  const openNew = () =>
    setEditing({
      id: null,
      form: {
        title: '',
        videoUrl: '',
        sequenceOrder: String(nextOrder),
        body: '',
        quizId: '',
      },
    });

  const openEdit = (lesson: Lesson) =>
    setEditing({
      id: lesson.documentId,
      form: {
        title: lesson.title,
        videoUrl: lesson.videoUrl ?? '',
        sequenceOrder: lesson.sequenceOrder === null ? '' : String(lesson.sequenceOrder),
        body: fromBlocks(lesson.content),
        quizId: lesson.quiz?.documentId ?? '',
      },
    });

  const setForm = (patch: Partial<LessonForm>) =>
    setEditing((current) =>
      current ? { ...current, form: { ...current.form, ...patch } } : current
    );

  const selectedQuiz = editing
    ? (quizzes.find((quiz) => quiz.documentId === editing.form.quizId) ?? null)
    : null;

  const lessonForm = editing ? (
    <form onSubmit={saveLesson} className="max-w-xl space-y-4">
      <div>
        <label className={label} htmlFor="lesson-title">
          Title
        </label>
        <input
          id="lesson-title"
          className={input}
          value={editing.form.title}
          onChange={(event) => setForm({ title: event.target.value })}
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
        <div>
          <label className={label} htmlFor="lesson-video">
            Video URL
          </label>
          <input
            id="lesson-video"
            className={input}
            value={editing.form.videoUrl}
            onChange={(event) => setForm({ videoUrl: event.target.value })}
            placeholder="https://…"
          />
        </div>
        <div>
          <label className={label} htmlFor="lesson-order">
            Order
          </label>
          <input
            id="lesson-order"
            className={input}
            inputMode="numeric"
            value={editing.form.sequenceOrder}
            onChange={(event) => setForm({ sequenceOrder: event.target.value })}
          />
        </div>
      </div>

      <div>
        <label className={label} htmlFor="lesson-body">
          Body
        </label>
        <textarea
          id="lesson-body"
          className={`${input} min-h-40`}
          value={editing.form.body}
          onChange={(event) => setForm({ body: event.target.value })}
          placeholder={'One paragraph per block.\n\nLeave a blank line between them.'}
        />
        <p className={`mt-1.5 ${muted}`}>
          Plain paragraphs. Content written in the Strapi editor keeps its text here
          but loses headings and lists if you save from this form.
        </p>
      </div>

      <div>
        <label className={label} htmlFor="lesson-quiz">
          Quiz
        </label>
        <select
          id="lesson-quiz"
          className={input}
          value={editing.form.quizId}
          onChange={(event) => setForm({ quizId: event.target.value })}
        >
          <option value="">No quiz</option>
          {quizzes.map((quiz) => (
            <option key={quiz.documentId} value={quiz.documentId}>
              {quizLabel(quiz)}
            </option>
          ))}
        </select>
        <p className={`mt-1.5 ${muted}`}>
          {selectedQuiz && (selectedQuiz.Question?.length ?? 0) === 0
            ? 'This quiz has no questions yet, so it will not gate the lesson. Add them in the Strapi admin.'
            : selectedQuiz
              ? // The pass mark itself is not repeated here — it lives in one place on
                // the server, and the lesson page reads it from the progress payload.
                'Students must pass this quiz before they can complete the lesson or move to the next one.'
              : 'A quiz belongs to one lesson at a time — picking one that is already attached moves it. Questions are written in the Strapi admin.'}
        </p>
      </div>

      {lessonError ? <ErrorNote message={lessonError} /> : null}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={savingLesson} className={btnPrimary}>
          {savingLesson ? 'Saving…' : editing.id ? 'Save lesson' : 'Add lesson'}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setLessonError(null);
          }}
          disabled={savingLesson}
          className={btnSecondary}
        >
          Cancel
        </button>
      </div>
    </form>
  ) : null;

  return (
    <Page
      title={`Edit: ${course.title}`}
      intro="Changes are live as soon as you save — there is no separate publish step."
      actions={
        <>
          <Link
            href={isAdmin(user) ? '/dashboard/admin' : '/dashboard/instructor'}
            className={btnSecondary}
          >
            Back
          </Link>
          <Link
            href={`/dashboard/instructor/courses/${courseId}`}
            className={btnSecondary}
          >
            Students
          </Link>
          <Link href={`/courses/${courseId}`} className={btnSecondary}>
            View course
          </Link>
        </>
      }
    >
      <div className="space-y-6">
        <Panel title="Course">
          <form onSubmit={saveCourse} className="max-w-xl space-y-4">
            <div>
              <label className={label} htmlFor="course-title">
                Title
              </label>
              <input
                id="course-title"
                className={input}
                value={titleValue}
                onChange={(event) => setCourseEdits((c) => ({ ...c, title: event.target.value }))}
                required
              />
            </div>

            <div>
              <label className={label} htmlFor="course-description">
                Description
              </label>
              <textarea
                id="course-description"
                className={`${input} min-h-24`}
                value={descriptionValue}
                onChange={(event) =>
                  setCourseEdits((c) => ({ ...c, description: event.target.value }))
                }
              />
            </div>

            <div>
              <label className={label} htmlFor="course-cover">
                Cover image URL
              </label>
              <input
                id="course-cover"
                className={input}
                value={coverValue}
                onChange={(event) =>
                  setCourseEdits((c) => ({ ...c, coverUrl: event.target.value }))
                }
                placeholder="https://…"
              />
            </div>

            <p className={muted}>
              The address <code>/courses/{course.slug ?? courseId}</code> stays as it is —
              a course keeps the URL it was created with so existing links do not break.
            </p>

            {courseError ? <ErrorNote message={courseError} /> : null}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={savingCourse || !courseDirty}
                className={btnPrimary}
              >
                {savingCourse ? 'Saving…' : 'Save course'}
              </button>
              {courseDirty && !savingCourse ? (
                <button
                  type="button"
                  onClick={() => {
                    setCourseEdits({});
                    setCourseError(null);
                  }}
                  className={btnSecondary}
                >
                  Discard changes
                </button>
              ) : null}
              <button type="button" onClick={() => void removeCourse()} className={btnSecondary}>
                Delete course
              </button>
            </div>
          </form>
        </Panel>

        <Panel
          title={`Lessons (${lessons.length})`}
          action={
            editing ? null : (
              <button type="button" onClick={openNew} className={btnPrimary}>
                Add a lesson
              </button>
            )
          }
        >
          {editing && editing.id === null ? (
            <div className={`${card} mb-4`}>
              <h3 className="mb-4 text-sm font-semibold">New lesson</h3>
              {lessonForm}
            </div>
          ) : null}

          {lessonError && !editing ? (
            <div className="mb-3">
              <ErrorNote message={lessonError} />
            </div>
          ) : null}

          {lessons.length === 0 ? (
            <Empty>
              No lessons yet. Add the first one — students see them in the order you
              number them.
            </Empty>
          ) : (
            <ul className="space-y-3">
              {lessons.map((lesson, index) => {
                // Resolved through `quizById`, never read off `lesson.quiz` directly —
                // that copy has no questions on it, so the count would always read 0
                // and the badge would never show. Falls back to the shallow copy if the
                // quiz somehow is not in the list, which keeps the id visible.
                const quiz = lesson.quiz
                  ? (quizById.get(lesson.quiz.documentId) ?? lesson.quiz)
                  : null;
                // An empty quiz gates nothing: the backend's gate asks whether the
                // student passed, and a quiz with no questions scores 100%.
                const gates = (quiz?.Question?.length ?? 0) > 0;

                return (
                  <li key={lesson.documentId} className={card}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="font-medium">
                          <span className={`mr-3 tabular-nums ${muted}`}>
                            {lesson.sequenceOrder ?? index + 1}
                          </span>
                          {lesson.title}
                        </p>
                        <p className={`mt-1 ${muted}`}>
                          {quiz ? (
                            <>
                              Quiz {quizLabel(quiz)}
                              {gates ? null : (
                                <> — no questions, so it gates nothing yet</>
                              )}
                            </>
                          ) : (
                            'No quiz'
                          )}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {gates ? <Badge>Gated</Badge> : null}
                        <Link href={`/lessons/${lesson.documentId}`} className={btnSecondary}>
                          View
                        </Link>
                        <button
                          type="button"
                          onClick={() => openEdit(lesson)}
                          disabled={savingLesson || deleting !== null}
                          className={btnSecondary}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeLesson(lesson)}
                          disabled={savingLesson || deleting !== null}
                          className={btnSecondary}
                        >
                          {deleting === lesson.documentId ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    </div>

                    {editing?.id === lesson.documentId ? (
                      <div className="mt-4 border-t border-black/10 pt-4 dark:border-white/15">
                        {lessonForm}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Quizzes">
          <p className={muted}>
            Quiz <em>questions</em> and their answers are written in the Strapi admin —
            the answer key is never sent to a browser, which is what makes grading on
            the server trustworthy. Once a quiz exists there, attach it to a lesson
            above, or set it as this course&apos;s final or practice quiz from the
            admin.
          </p>
          <p className={`mt-3 ${muted}`}>
            {course.final_quiz ? 'A final quiz is set. ' : 'No final quiz is set. '}
            {(course.practice_quizzes?.length ?? 0) === 0
              ? 'No practice quizzes.'
              : `${course.practice_quizzes?.length} practice quiz(zes).`}
          </p>
        </Panel>
      </div>
    </Page>
  );
}
