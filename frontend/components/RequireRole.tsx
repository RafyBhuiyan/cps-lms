'use client';

/**
 * Gate for the role-specific pages.
 *
 * This is a convenience, not a security boundary: it decides what to render, and
 * the API decides what may be read or written. Every endpoint behind these pages
 * checks the caller's role and ownership server-side, so bypassing this component
 * yields a page full of 403s rather than someone else's data.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { roleTypeOf } from '@/lib/roles';
import type { Profile } from '@/lib/types';
import { Loading, btnPrimary, card, muted } from './ui';

export function RequireRole({
  allow,
  children,
}: {
  /** Predicates from `lib/roles`, any of which admits the caller. */
  allow: ((user: Profile | null) => boolean)[];
  children: ReactNode;
}) {
  const { status, user } = useAuth();

  if (status === 'loading') {
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <Loading label="Checking your session…" />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-6 py-16">
        <div className={card}>
          <h1 className="text-lg font-semibold">Sign in to continue</h1>
          <p className={`mt-2 ${muted}`}>This page needs an account.</p>
          <Link href="/login" className={`${btnPrimary} mt-4`}>
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  if (!allow.some((permits) => permits(user))) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-6 py-16">
        <div className={card}>
          <h1 className="text-lg font-semibold">Not for your role</h1>
          <p className={`mt-2 ${muted}`}>
            You are signed in as <strong>{roleTypeOf(user)}</strong>, which does not have
            access here.
          </p>
          <Link href="/courses" className={`${btnPrimary} mt-4`}>
            Back to courses
          </Link>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
