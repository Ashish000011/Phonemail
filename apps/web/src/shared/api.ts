import type { z } from 'zod';
import { apiErrorSchema, CSRF_HEADER, CSRF_HEADER_VALUE } from '@phonemail/shared';

/** An API error with the stable code the server sent, ready to translate. */
export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** JSON body, or FormData for file uploads. */
  body?: unknown;
  /** Validates the response, so a server change can't silently break the UI. */
  schema?: z.ZodType<T>;
}

let refreshing: Promise<boolean> | null = null;

/**
 * The access cookie lives 15 minutes. When it runs out, swap the refresh
 * cookie for a new pair once (shared by every request that noticed), then
 * retry. Two tabs refreshing at once is fine: the loser just retries.
 */
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { [CSRF_HEADER]: CSRF_HEADER_VALUE },
  })
    .then(async (response) => {
      if (response.ok) return true;
      const body = (await response.json().catch(() => null)) as {
        error?: { code?: string };
      } | null;
      return body?.error?.code === 'REFRESH_RACE';
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function send(path: string, method: string, body: unknown): Promise<Response> {
  const isForm = body instanceof FormData;
  return fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      [CSRF_HEADER]: CSRF_HEADER_VALUE,
      ...(body === undefined || isForm ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
}

/**
 * The one way the web app talks to the API. Cookies travel automatically;
 * the CSRF header is always added; an expired session is renewed once.
 */
export async function api<T = unknown>(path: string, options: RequestOptions<T> = {}): Promise<T> {
  const { method = 'GET', body, schema } = options;
  let response = await send(path, method, body);
  if (response.status === 401 && !path.startsWith('/auth/') && (await refreshSession())) {
    response = await send(path, method, body);
  }

  const data: unknown =
    response.status === 204 ? undefined : await response.json().catch(() => undefined);

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(data);
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      throw new ApiRequestError(response.status, code, message, details);
    }
    // Our API always answers with a JSON error. Anything else came from a proxy
    // (nginx, the tunnel) because the server is down or unreachable.
    throw new ApiRequestError(response.status, 'NETWORK', `Request failed (${response.status})`);
  }

  return schema ? schema.parse(data) : (data as T);
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 401;
}
