'use client';

/**
 * Register.
 *
 * Sign-ups land in the default role, which in this project is the built-in
 * `authenticated` role renamed "Student". Instructor, content-manager and admin
 * accounts are assigned from the Strapi dashboard — there is deliberately no way to
 * pick a role here, since the endpoint would happily ignore it anyway.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { homeFor } from '@/lib/roles';
import { ErrorNote, btnPrimary, card, input, label, muted } from '@/components/ui';

export default function RegisterPage() {
  const { signUp } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const profile = await signUp(username.trim(), email.trim(), password);
      router.replace(homeFor(profile));
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-6 py-16">
      <div className={card}>
        <h1 className="text-xl font-semibold tracking-tight">Create an account</h1>
        <p className={`mt-1 ${muted}`}>New accounts are students.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className={label} htmlFor="username">
              Username
            </label>
            <input
              id="username"
              className={input}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label className={label} htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              className={input}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
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
              autoComplete="new-password"
              minLength={6}
              required
            />
          </div>

          {error ? <ErrorNote message={error} /> : null}

          <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
            {busy ? 'Creating…' : 'Create account'}
          </button>
        </form>

        <p className={`mt-6 ${muted}`}>
          Already registered?{' '}
          <Link href="/login" className="underline">
            Sign in
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
