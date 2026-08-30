'use client';

/**
 * Content-manager dashboard: write posts, publish them, see what is still a draft.
 *
 * Two things are handled server-side and deliberately not here. Authorship comes
 * from the token, so a post cannot be attributed to someone else. And the slug is
 * derived from the title by the API — the content API does not fill uid fields
 * (that lives in the admin panel), so a post created from this form would otherwise
 * have no URL.
 *
 * The body is written as plain text and sent as Strapi `blocks`: one paragraph per
 * blank-line-separated chunk. Anything richer belongs in the Strapi editor, which
 * is a block editor already.
 */

import Link from 'next/link';
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
import { toBlocks } from '@/lib/blocks';
import { isAdmin, isContentManager } from '@/lib/roles';
import { useAsync } from '@/lib/useAsync';

export default function ManagerDashboardPage() {
  return (
    <RequireRole allow={[isContentManager, isAdmin]}>
      <ManagerDashboard />
    </RequireRole>
  );
}

function ManagerDashboard() {
  const { token } = useAuth();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState<'draft' | 'published' | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  const load = useMemo(() => (token ? () => api.listBlogs(token) : null), [token]);
  const { data: posts, error, loading, reload } = useAsync(load);

  const submit = async (currentStatus: 'draft' | 'published') => {
    if (!token) return;

    setBusy(currentStatus);
    setFormError(null);

    try {
      await api.createBlog(
        { title: title.trim(), body: toBlocks(body), currentStatus },
        token
      );
      setTitle('');
      setBody('');
      reload();
    } catch (cause: unknown) {
      setFormError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  const publish = async (documentId: string) => {
    if (!token) return;

    setPublishing(documentId);
    setPublishError(null);

    try {
      await api.publishBlog(documentId, token);
      reload();
    } catch (cause: unknown) {
      setPublishError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPublishing(null);
    }
  };

  const drafts = (posts ?? []).filter((post) => post.currentStatus === 'draft');
  const live = (posts ?? []).filter((post) => post.currentStatus === 'published');

  return (
    <Page
      title="Posts"
      intro="Drafts are visible only to you and to admins until you publish them."
      actions={
        <Link href="/blog" className={btnSecondary}>
          View the blog
        </Link>
      }
    >
      <div className="space-y-6">
        <Panel title="New post">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit('draft');
            }}
            className="max-w-xl space-y-4"
          >
            <div>
              <label className={label} htmlFor="post-title">
                Title
              </label>
              <input
                id="post-title"
                className={input}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
            </div>

            <div>
              <label className={label} htmlFor="post-body">
                Body
              </label>
              <textarea
                id="post-body"
                className={`${input} min-h-40`}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={'One paragraph per block.\n\nLeave a blank line between them.'}
              />
            </div>

            {formError ? <ErrorNote message={formError} /> : null}

            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={busy !== null} className={btnPrimary}>
                {busy === 'draft' ? 'Saving…' : 'Save as draft'}
              </button>
              <button
                type="button"
                onClick={() => void submit('published')}
                disabled={busy !== null}
                className={btnSecondary}
              >
                {busy === 'published' ? 'Publishing…' : 'Publish now'}
              </button>
            </div>
          </form>
        </Panel>

        {loading && !posts ? <Loading /> : null}
        {error ? <ErrorNote message={error} onRetry={reload} /> : null}

        {posts ? (
          <>
            <Panel title={`Drafts (${drafts.length})`}>
              {publishError ? (
                <div className="mb-3">
                  <ErrorNote message={publishError} />
                </div>
              ) : null}

              {drafts.length === 0 ? (
                <Empty>No drafts waiting.</Empty>
              ) : (
                <ul className="space-y-3">
                  {drafts.map((post) => (
                    <li
                      key={post.documentId}
                      className={`${card} flex flex-wrap items-center justify-between gap-3`}
                    >
                      <div className="flex-1">
                        <p className="font-medium">{post.title}</p>
                        <p className={muted}>
                          {post.slug ? `/blog/${post.slug}` : 'No slug'} · created{' '}
                          {new Date(post.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {post.slug ? (
                          <Link href={`/blog/${post.slug}`} className={btnSecondary}>
                            Preview
                          </Link>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void publish(post.documentId)}
                          disabled={publishing !== null}
                          className={btnPrimary}
                        >
                          {publishing === post.documentId ? 'Publishing…' : 'Publish'}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title={`Published (${live.length})`}>
              {live.length === 0 ? (
                <Empty>Nothing published yet.</Empty>
              ) : (
                <ul className="divide-y divide-black/10 dark:divide-white/15">
                  {live.map((post) => (
                    <li
                      key={post.documentId}
                      className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                    >
                      <div>
                        {post.slug ? (
                          <Link href={`/blog/${post.slug}`} className="font-medium hover:underline">
                            {post.title}
                          </Link>
                        ) : (
                          <p className="font-medium">{post.title}</p>
                        )}
                        <p className={muted}>
                          {new Date(post.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge tone="good">Live</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </>
        ) : null}
      </div>
    </Page>
  );
}
