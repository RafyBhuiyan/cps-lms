'use client';

/**
 * Sign in.
 *
 * Note the rate limit: users-permissions allows about five attempts per identifier
 * every five minutes, and answers 429 after that. `lib/strapi.ts` turns that into
 * a message that says so, because the default reads like a wrong password.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { homeFor } from '@/lib/roles';
import { ErrorNote, btnPrimary, card, input, label, muted } from '@/components/ui';

export default function LoginPage() {
  const { signIn, status, user } = useAuth();
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Someone arriving here with a live session has nothing to do on this page.
  useEffect(() => {
    if (status === 'authenticated' && user) {
      router.replace(homeFor(user));
    }
  }, [status, user, router]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const profile = await signIn(identifier.trim(), password);
      router.replace(homeFor(profile));
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-6 py-16">
      <div className={card}>
        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
        <p className={`mt-1 ${muted}`}>Email or username, plus your password.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className={label} htmlFor="identifier">
              Email or username
            </label>
            <input
              id="identifier"
              className={input}
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label className={label} htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className={input}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error ? <ErrorNote message={error} /> : null}

          <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className={`mt-6 ${muted}`}>
          No account?{' '}
          <Link href="/register" className="underline">
            Register as a student
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
