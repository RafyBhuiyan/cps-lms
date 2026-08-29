'use client';

/**
 * One blog post, addressed by slug.
 *
 * Fetched through the list endpoint with a slug filter rather than `findOne`, which
 * takes a documentId. The list is visibility-scoped server-side, so a draft
 * belonging to someone else comes back as an empty result — indistinguishable from
 * a post that does not exist, which is the right answer to give.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import { Blocks } from '@/components/Blocks';
import { Badge, ErrorNote, Loading, Page, muted } from '@/components/ui';
import * as api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAsync } from '@/lib/useAsync';

export default function BlogPostPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { token, status } = useAuth();

  const load = useMemo(
    () => (status === 'loading' ? null : () => api.getBlogBySlug(slug, token)),
    [slug, status, token]
  );
  const { data: post, error, loading, reload } = useAsync(load);

  if (loading || status === 'loading') {
    return (
      <Page title="Post">
        <Loading />
      </Page>
    );
  }

  if (error || !post) {
    return (
      <Page title="Post">
        <ErrorNote message={error ?? 'This post is not available.'} onRetry={reload} />
        <p className={`mt-4 ${muted}`}>
          <Link href="/blog" className="underline">
            Back to the blog
          </Link>
        </p>
      </Page>
    );
  }

  return (
    <Page
      title={post.title}
      intro={`Published ${new Date(post.createdAt).toLocaleDateString()}`}
      actions={post.currentStatus === 'draft' ? <Badge tone="warn">Draft</Badge> : undefined}
    >
      <article className="max-w-2xl">
        <Blocks content={post.body} />
      </article>

      <p className={`mt-10 ${muted}`}>
        <Link href="/blog" className="underline">
          ← All posts
        </Link>
      </p>
    </Page>
  );
}
