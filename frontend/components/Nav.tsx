'use client';

/**
 * Top navigation. The link set is derived from the caller's role, which is why the
 * backend exposes `/api/profile/me` at all.
 *
 * The links a role cannot use are hidden rather than disabled — but hiding is
 * cosmetic: every endpoint behind them is enforced server-side, so a hand-typed
 * URL gets a 403 from the API, not a rendered page.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  homeFor,
  isAdmin,
  isContentManager,
  isInstructor,
  isStudent,
  roleLabel,
} from '@/lib/roles';
import { Badge, btnPrimary, btnSecondary } from './ui';

export function Nav() {
  const { status, user, signOut } = useAuth();
  const pathname = usePathname();

  const links: { href: string; label: string }[] = [
    { href: '/courses', label: 'Courses' },
    { href: '/blog', label: 'Blog' },
  ];

  if (isStudent(user)) links.push({ href: '/dashboard/student', label: 'My learning' });
  if (isInstructor(user)) links.push({ href: '/dashboard/instructor', label: 'Teaching' });
  if (isContentManager(user)) links.push({ href: '/dashboard/manager', label: 'Posts' });
  if (isAdmin(user)) {
    links.push({ href: '/dashboard/manager', label: 'Posts' });
    links.push({ href: '/dashboard/admin', label: 'Platform' });
  }

  return (
    <header className="border-b border-black/10 dark:border-white/15">
      <nav className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4">
        <Link href={user ? homeFor(user) : '/'} className="font-semibold tracking-tight">
          CPS&nbsp;LMS
        </Link>

        <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          {links.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <li key={`${link.href}-${link.label}`}>
                <Link
                  href={link.href}
                  className={
                    active
                      ? 'font-medium underline decoration-2 underline-offset-4'
                      : 'text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white'
                  }
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="ml-auto flex items-center gap-3 text-sm">
          {status === 'loading' ? (
            <span className="text-zinc-500">…</span>
          ) : user ? (
            <>
              <span className="hidden sm:inline">{user.username ?? user.email}</span>
              <Badge>{roleLabel(user)}</Badge>
              <button type="button" onClick={signOut} className={btnSecondary}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className={btnSecondary}>
                Sign in
              </Link>
              <Link href="/register" className={btnPrimary}>
                Register
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
