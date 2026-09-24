import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { ClientType } from '@phonemail/shared';
import { env } from '../../config/env.js';

/**
 * Two tokens (docs/spec/03-auth-and-accounts.md):
 * - access token: a JWT (HS256) valid for 15 minutes, checked on every request
 * - refresh token: 32 random bytes valid for 30 days, stored only as a hash,
 *   replaced by a new one every time it's used
 */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_DAYS = 30;

const ISSUER = 'phonemail';
const secret = new TextEncoder().encode(env.JWT_SECRET);

export interface AccessClaims {
  userId: string;
  sessionId: string;
  clientType: ClientType;
}

export async function signAccessToken({ userId, sessionId, clientType }: AccessClaims) {
  return new SignJWT({ sid: sessionId, ct: clientType })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secret);
}

/** The claims, or null if the token is missing, forged or expired. */
export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER, algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null;
    return {
      userId: payload.sub,
      sessionId: payload.sid,
      clientType: payload.ct as ClientType,
    };
  } catch {
    return null;
  }
}

export function newRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/** We store only this hash, so a database leak doesn't hand out live sessions. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
