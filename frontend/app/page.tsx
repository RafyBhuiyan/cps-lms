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
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">
      <section className="max-w-2xl">
        <h1 className="text-4xl font-semibold leading-tight tracking-tight">
          A small learning platform, wired end to end.
        </h1>
        <p className={`mt-4 text-lg ${muted}`}>
          Next.js in front, Strapi behind it. Enrolment, lesson progress and quiz
          grading are all enforced by the API — this app only asks.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {status === 'loading' ? (
            <Loading label="Restoring your session…" />
          ) : user ? (
            <>
              <Link href={homeFor(user)} className={btnPrimary}>
                Go to your {roleLabel(user).toLowerCase()} dashboard
              </Link>
              <Link href="/courses" className={btnSecondary}>
                Browse courses
              </Link>
            </>
          ) : (
            <>
              <Link href="/register" className={btnPrimary}>
                Create a student account
              </Link>
              <Link href="/courses" className={btnSecondary}>
                Browse courses
              </Link>
            </>
          )}
        </div>
      </section>

      <section className="mt-16 grid gap-4 sm:grid-cols-3">
        {FEATURES.map((feature) => (
          <div key={feature.title} className={card}>
            <h2 className="font-semibold">{feature.title}</h2>
            <p className={`mt-2 ${muted}`}>{feature.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
