'use client';

/**
 * Landing page. Signed in, it points at the dashboard for the caller's role;
 * signed out, it explains what the thing is and offers the catalog.
 */

import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { homeFor, roleLabel } from '@/lib/roles';
import { Loading, btnPrimary, btnSecondary, card, muted } from '@/components/ui';

const FEATURES = [
  {
    title: 'Courses and lessons',
    body: 'Enrol, work through lessons in order, and mark them complete as you go.',
  },
  {
    title: 'Server-graded quizzes',
    body: 'Answers are graded by the API. The correct answers are marked private in the schema and never leave the backend.',
  },
  {
    title: 'Progress that is counted, not guessed',
    body: 'Completed lessons out of total, recomputed by the server on every change, with the final quiz grade alongside.',
  },
];

export default function Home() {
  const { status, user } = useAuth();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-20 lg:py-32">
      <section className="mx-auto max-w-3xl text-center flex flex-col items-center">
        <h1 className="text-5xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-6xl">
          A learning platform, wired end to end.
        </h1>
        <p className="mt-6 text-xl leading-8 text-zinc-600 dark:text-zinc-400 max-w-2xl">
          Next.js in front, Strapi behind it. Enrolment, lesson progress and quiz
          grading are all enforced by the API — this app only asks.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          {status === 'loading' ? (
            <Loading label="Restoring your session…" />
          ) : user ? (
            <>
              <Link href={homeFor(user)} className={`${btnPrimary} px-6 py-3 text-base`}>
                Go to your {roleLabel(user).toLowerCase()} dashboard
              </Link>
              <Link href="/courses" className={`${btnSecondary} px-6 py-3 text-base`}>
                Browse courses
              </Link>
            </>
          ) : (
            <>
              <Link href="/register" className={`${btnPrimary} px-6 py-3 text-base`}>
                Create a student account
              </Link>
              <Link href="/courses" className={`${btnSecondary} px-6 py-3 text-base`}>
                Browse courses
              </Link>
            </>
          )}
        </div>
      </section>

      <section className="mx-auto mt-24 max-w-5xl">
        <div className="grid gap-6 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} className={`${card} flex flex-col justify-between`}>
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{feature.title}</h2>
                <p className={`mt-3 leading-relaxed ${muted}`}>{feature.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
