'use client';

/**
 * The blog index.
 *
 * Draft posts are filtered out by the API, not here — the list is scoped
 * server-side, so a reader simply never receives one while an author receives
 * their own. That is why a "Draft" badge can appear on this page at all: seeing it
 * means the row was sent to you deliberately.
 */

import Link from 'next/link';
import { useMemo } from 'react';
import { Badge, Empty, ErrorNote, Loading, Page, btnPrimary, card, muted } from '@/components/ui';
import * as api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { canAuthorContent } from '@/lib/roles';
import { useAsync } from '@/lib/useAsync';

export default function BlogIndexPage() {
  const { token, user, status } = useAuth();

  const load = useMemo(
    () => (status === 'loading' ? null : () => api.listBlogs(token)),
    [status, token]
  );
  const { data: posts, error, loading, reload } = useAsync(load);

  return (
    <Page
      title="Blog"
      intro="Announcements and writing from the team."
      actions={
        canAuthorContent(user) ? (
          <Link href="/dashboard/manager" className={btnPrimary}>
            Write a post
          </Link>
        ) : null
      }
    >
      {loading || status === 'loading' ? <Loading /> : null}
      {error ? <ErrorNote message={error} onRetry={reload} /> : null}

      {posts ? (
        posts.length === 0 ? (
          <Empty>Nothing published yet.</Empty>
        ) : (
          <ul className="space-y-4">
            {posts.map((post) => {
              const heading = (
                <>
                  <h2 className="font-semibold">{post.title}</h2>
                  <p className={`mt-1 ${muted}`}>
                    {new Date(post.createdAt).toLocaleDateString()}
                  </p>
                </>
              );

              return (
                <li key={post.documentId} className={`${card} flex items-start justify-between gap-4`}>
                  {/* Posts are addressed by slug; one saved without a slug cannot be
                      opened, so it is listed but not linked. */}
                  <div className="flex-1">
                    {post.slug ? (
                      <Link href={`/blog/${post.slug}`} className="block hover:underline">
                        {heading}
                      </Link>
                    ) : (
                      <>
                        {heading}
                        <p className={`mt-1 ${muted}`}>No slug — cannot be opened.</p>
                      </>
                    )}
                  </div>
                  {post.currentStatus === 'draft' ? <Badge tone="warn">Draft</Badge> : null}
                </li>
              );
            })}
          </ul>
        )
      ) : null}
    </Page>
  );
}
