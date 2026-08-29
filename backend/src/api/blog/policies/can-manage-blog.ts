/**
 * can-manage-blog
 *
 * Admin may manage any post. A content_manager may create posts and manage the
 * ones they authored — checked against `blog.author`, which the controller
 * assigns from the token rather than the request body. Nobody else writes blogs.
 */

import { isAdmin, isContentManager, type AuthUser } from '../../../utils/roles';
import { ANY_VERSION } from '../../../utils/lms';

export default async (policyContext: any) => {
  const user = policyContext.state?.user as AuthUser;

  if (!user) {
    return false;
  }

  if (isAdmin(user)) {
    return true;
  }

  if (!isContentManager(user)) {
    return false;
  }

  // Core routes name the param `:id`; the custom publish route names it
  // `:documentId`. Both must be read here — missing means "create", which is
  // allowed, so looking for only one of them would hand a content_manager
  // publish rights over everybody's posts.
  const documentId = policyContext.params?.id ?? policyContext.params?.documentId;

  // create: there is nothing to own yet, and the controller stamps `author`
  // from the token, so authorship cannot be spoofed here.
  if (!documentId) {
    return true;
  }

  const blog = await strapi.documents('api::blog.blog').findOne({
    documentId,
    populate: ['author'],
    ...ANY_VERSION,
  });

  if (!blog) {
    return false;
  }

  return (blog as any).author?.id === user.id;
};
