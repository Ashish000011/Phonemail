import type { FastifyRequest } from 'fastify';
import type { ClientType } from '@phonemail/shared';
import { AppError } from '../../lib/errors.js';
import { ACCESS_COOKIE } from './cookies.js';
import { loadActiveSession } from './sessions.js';
import { verifyAccessToken } from './tokens.js';

export interface AuthContext {
  userId: string;
  sessionId: string;
  clientType: ClientType;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

/**
 * preHandler for routes that need a signed-in user. Checks the access token's
 * signature and expiry, then the session row, so "log out" and "log out of
 * other devices" take effect immediately rather than after 15 minutes.
 */
export async function requireAuth(request: FastifyRequest): Promise<void> {
  const token = request.cookies[ACCESS_COOKIE];
  const claims = token ? await verifyAccessToken(token) : null;
  if (!claims) throw new AppError(401, 'UNAUTHORIZED', 'Please sign in.');
  const session = await loadActiveSession(claims.sessionId, claims.userId);
  if (!session) throw new AppError(401, 'UNAUTHORIZED', 'Please sign in.');
  // Signed in with a temporary PIN: set a real password before anything else.
  if (
    session.user.mustChangePassword &&
    !ALLOWED_BEFORE_PASSWORD_CHANGE.has(request.routeOptions.url ?? '')
  ) {
    throw new AppError(403, 'PASSWORD_CHANGE_REQUIRED', 'Choose a new password first.');
  }
  request.auth = claims;
}

const ALLOWED_BEFORE_PASSWORD_CHANGE = new Set(['/api/me', '/api/auth/password/change']);

/** The signed-in user of a route guarded by requireAuth. */
export function currentAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) throw new AppError(401, 'UNAUTHORIZED', 'Please sign in.');
  return request.auth;
}
