/**
 * Small shared UI pieces.
 *
 * Deliberately plain: Tailwind classes only, no component library, nothing added
 * to package.json.
 */

import type { ReactNode } from 'react';

/* Class strings, exported so forms and links can look like the buttons. */

export const btn =
  'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100';

export const btnPrimary = `${btn} bg-zinc-900 text-white shadow-md hover:bg-zinc-800 hover:shadow-lg dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white`;

export const btnSecondary = `${btn} border border-black/10 bg-white shadow-sm hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-950 dark:hover:bg-zinc-900`;

export const input =
  'w-full rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm shadow-sm outline-none transition-all focus:border-zinc-500 focus:ring-4 focus:ring-zinc-500/10 dark:border-white/10 dark:bg-zinc-900 dark:focus:border-zinc-400 dark:focus:ring-white/10';

export const label = 'block text-sm font-medium mb-1.5 text-zinc-700 dark:text-zinc-300';

export const card =
  'rounded-2xl border border-black/5 bg-white p-6 shadow-sm transition-all hover:shadow-md dark:border-white/10 dark:bg-zinc-950 dark:hover:border-white/20';

export const muted = 'text-sm text-zinc-600 dark:text-zinc-400';

/** Page shell: consistent width and vertical rhythm for every route. */
export function Page({
  title,
  intro,
  actions,
  children,
}: {
  title: string;
  intro?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {intro ? <p className={`mt-2 max-w-2xl ${muted}`}>{intro}</p> : null}
        </div>
        {actions ? <div className="flex gap-2">{actions}</div> : null}
      </header>
      {children}
    </main>
  );
}

export function Panel({
  title,
  action,
  children,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={card}>
      {title ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <p className={muted} role="status">
      {label}
    </p>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4 text-sm text-red-700 dark:text-red-300 shadow-sm"
    >
      <p>{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="mt-2 font-medium underline underline-offset-2 hover:text-red-800 dark:hover:text-red-200">
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-black/10 bg-zinc-50/50 px-6 py-12 text-center ${muted} dark:border-white/10 dark:bg-zinc-900/50`}>
      <p>{children}</p>
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'good' | 'warn';
}) {
  const tones = {
    neutral: 'bg-black/[.06] text-zinc-700 dark:bg-white/[.10] dark:text-zinc-300',
    good: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    warn: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  } as const;

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

/** Small labelled number, for the dashboards. */
export function Stat({ label: name, value }: { label: string; value: ReactNode }) {
  return (
    <div className={card}>
      <p className={muted}>{name}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}
