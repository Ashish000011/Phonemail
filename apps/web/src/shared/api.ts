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
  body?: unknown;
  /** Validates the response, so a server change can't silently break the UI. */
  schema?: z.ZodType<T>;
}

/**
 * The one way the web app talks to the API. Cookies travel automatically;
 * the CSRF header is always added.
 */
export async function api<T = unknown>(path: string, options: RequestOptions<T> = {}): Promise<T> {
  const { method = 'GET', body, schema } = options;
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      [CSRF_HEADER]: CSRF_HEADER_VALUE,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data: unknown =
    response.status === 204 ? undefined : await response.json().catch(() => undefined);

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(data);
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      throw new ApiRequestError(response.status, code, message, details);
    }
    throw new ApiRequestError(response.status, 'INTERNAL', `Request failed (${response.status})`);
  }

  return schema ? schema.parse(data) : (data as T);
}
