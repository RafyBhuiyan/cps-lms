/**
 * is-admin
 *
 * Guards every route in this API. The permission checkbox in the dashboard
 * already limits them to the Admin role; this makes the restriction explicit in
 * code so an accidental tick on another role does not expose platform-wide
 * counts, the account directory, or role assignment.
 */

import { isAdmin, type AuthUser } from '../../../utils/roles';

export default (policyContext: any) => {
  const user = policyContext.state?.user as AuthUser;

  if (!user) {
    return false;
  }

  return isAdmin(user);
};
