/**
 * blog controller
 */

import { factories } from '@strapi/strapi';
import type { Context } from 'koa';
import { isAdmin, isContentManager, type AuthUser } from '../../../utils/roles';
import { ANY_VERSION, PUBLISHED, scopeQueryToDocuments } from '../../../utils/lms';

/**
 * The blog is public, so `find`/`findOne` are reachable without a token. Only
 * the people who write posts may see unpublished ones: admin sees every draft,
 * a content_manager sees their own.
 *
 * Returns null when the caller may see everything.
 */
const draftScopeFor = (user: AuthUser | undefined): Record<string, any> | null => {
  if (user && isAdmin(user)) {
    return null;
  }

  if (user && isContentManager(user)) {
    // Own drafts, plus everything published.
    return {
      $or: [{ currentStatus: 'published' }, { author: { id: user.id } }],
    };
  }

  return { currentStatus: 'published' };
};

/** `slug` is a uid field, so it must be URL-safe and unique. */
const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    // Any run of non-alphanumerics becomes a single dash; `u` keeps this working
    // for non-Latin titles rather than reducing them to an empty string.
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'post';

/**
 * First unused variation of `base`.
 *
 * Needed because the content API does not fill uid fields: that generation lives
 * in the admin panel's content-manager plugin (`services/uid.js`), so a post
 * created over REST would be saved with `slug: null` — and the blog is addressed
 * by slug, which would make it unreachable at its own URL.
 */
const availableSlug = async (base: string) => {
  for (let attempt = 1; attempt <= 50; attempt += 1) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`;

    const [taken] = await strapi.documents('api::blog.blog').findMany({
      filters: { slug: candidate },
      limit: 1,
      // Draft rows hold the uid too, so a published-only check would miss a
      // collision and the unique index would reject the insert.
      ...ANY_VERSION,
    });

    if (!taken) {
      return candidate;
    }
  }

  // 50 posts sharing a title is not a case worth another query for.
  return `${base}-${Math.round(Math.random() * 1e6)}`;
};

export default factories.createCoreController('api::blog.blog', () => ({
  /**
   * GET /api/blogs
   *
   * Filtered here rather than by trusting the client, because the alternative —
   * having the frontend send `?filters[currentStatus]=published` — is not a
   * restriction at all: anyone can ask for `draft` instead.
   */
  async find(ctx: Context) {
    const scope = draftScopeFor(ctx.state.user);

    if (scope) {
      // Resolved server-side rather than injected as a filter: the
      // content_manager branch reaches through `author` into the
      // users-permissions user, which the query validator would reject for any
      // role lacking `user.find`. See `scopeQueryToDocuments`.
      await scopeQueryToDocuments(ctx, 'api::blog.blog', scope);
    }

    return super.find(ctx);
  },

  async findOne(ctx: Context) {
    const { user } = ctx.state;

    if (!user || !isAdmin(user)) {
      const blog = await strapi.documents('api::blog.blog').findOne({
        documentId: ctx.params.id,
        populate: ['author'],
        ...ANY_VERSION,
      });

      if (!blog) {
        return ctx.notFound('Post not found.');
      }

      const isPublished = (blog as any).currentStatus === 'published';
      const isOwnDraft =
        user && isContentManager(user) && (blog as any).author?.id === user.id;

      // 404 rather than 403: the existence of an unpublished post is itself not
      // public information.
      if (!isPublished && !isOwnDraft) {
        return ctx.notFound('Post not found.');
      }
    }

    return super.findOne(ctx);
  },

  /**
   * POST /api/blogs
   *
   * Authorship comes from the token, and a post starts as a draft — publishing
   * is a separate, deliberate action.
   */
  async create(ctx: Context) {
    const { user } = ctx.state;

    if (!user) {
      return ctx.unauthorized('You must be logged in to write a post.');
    }

    const body = ctx.request.body as { data?: Record<string, unknown> } | undefined;

    if (!body?.data || typeof body.data !== 'object') {
      return ctx.badRequest('Missing "data" payload in the request body.');
    }

    body.data.author = user.id;

    if (body.data.currentStatus !== 'published') {
      body.data.currentStatus = 'draft';
    }

    // A client may send its own slug; otherwise one is derived from the title, so
    // every post created through the API has a working URL.
    if (typeof body.data.slug !== 'string' || body.data.slug.trim() === '') {
      body.data.slug = await availableSlug(slugify(String(body.data.title ?? '')));
    }

    return super.create(ctx);
  },

  /**
   * PUT /api/blogs/:documentId/publish
   *
   * `currentStatus` is an ordinary editable field, so this endpoint is a
   * convenience rather than the only way to publish; the `can-manage-blog`
   * policy on it is what actually restricts who may do so.
   */
  async publish(ctx: Context) {
    const { user } = ctx.state;

    if (!user) {
      return ctx.unauthorized('You must be logged in to publish a post.');
    }

    const { documentId } = ctx.params;

    const existing = await strapi.documents('api::blog.blog').findOne({
      documentId,
      ...ANY_VERSION,
    });

    if (!existing) {
      return ctx.notFound('Post not found.');
    }

    const document = await strapi.documents('api::blog.blog').update({
      documentId,
      data: { currentStatus: 'published' } as any,
      ...PUBLISHED,
    });

    return { data: await this.sanitizeOutput!(document, ctx) };
  },
}));
