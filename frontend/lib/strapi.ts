/**
 * The one place that talks to Strapi.
 *
 * Everything runs in the browser with the JWT from localStorage, which is the
 * arrangement this project chose: no server-side session, no proxy route, so the
 * API URL is public (`NEXT_PUBLIC_STRAPI_URL`) and every request carries its own
 * bearer token.
 */

export const STRAPI_URL = (
  process.env.NEXT_PUBLIC_STRAPI_URL ?? 'http://localhost:1337'
).replace(/\/+$/, '');

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Envelope of a collection response. */
export type StrapiList<T> = {
  data: T[];
  meta: {
    pagination?: { page: number; pageSize: number; pageCount: number; total: number };
  };
};

/** Envelope of a single-entry or custom-endpoint response. */
export type StrapiSingle<T> = { data: T };

type RequestOptions = {
  token?: string | null;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
};

const parse = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/**
 * Turns a failed response into something worth showing a user.
 *
 * Strapi answers `{ error: { status, name, message } }`, but the interesting
 * cases are the ones where that message is unhelpful on its own: 429 is the
 * login rate limiter (five attempts per identifier per five minutes) and reads
 * as "invalid credentials" if you only look at the status.
 */
const messageFor = (status: number, payload: unknown): string => {
  const fromApi =
    typeof payload === 'object' &&
    payload !== null &&
    typeof (payload as { error?: { message?: unknown } }).error?.message === 'string'
      ? ((payload as { error: { message: string } }).error.message)
      : null;

  if (status === 429) {
    return 'Too many attempts. Strapi rate-limits logins to five per account every five minutes — wait a minute and try again.';
  }

  if (status === 401) {
    return fromApi ?? 'Your session has expired. Please sign in again.';
  }

  if (status === 403) {
    return fromApi ?? 'Your role does not allow that.';
  }

  return fromApi ?? `Request failed (HTTP ${status}).`;
};

export async function request<T>(
  path: string,
  { token, method = 'GET', body }: RequestOptions = {}
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${STRAPI_URL}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      // These reads are per-user and permission-scoped; a cached response could
      // show one account another's rows.
      cache: 'no-store',
    });
  } catch {
    // A network-level failure, which in development almost always means the
    // backend is not running — worth saying so rather than "Failed to fetch".
    throw new ApiError(0, `Cannot reach the API at ${STRAPI_URL}. Is Strapi running?`);
  }

  const text = await response.text();
  const payload = text ? parse(text) : null;

  if (!response.ok) {
    throw new ApiError(response.status, messageFor(response.status, payload));
  }

  return payload as T;
}
