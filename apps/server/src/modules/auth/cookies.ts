import type { FastifyReply } from 'fastify';
import { env } from '../../config/env.js';
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_DAYS } from './tokens.js';

export const ACCESS_COOKIE = 'pm_at';
export const REFRESH_COOKIE = 'pm_rt';
/** The refresh token is only ever sent to the refresh/logout endpoints. */
const REFRESH_PATH = '/api/auth';

/**
 * httpOnly: page JavaScript (and any injected script) can't read the tokens.
 * SameSite=Lax: other sites can't make the browser send them on form posts.
 * Secure: only over HTTPS, when the app is served over HTTPS.
 */
const baseOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.PUBLIC_BASE_URL.startsWith('https://'),
});

export function setAuthCookies(
  reply: FastifyReply,
  tokens: { accessToken: string; refreshToken: string },
) {
  reply.setCookie(ACCESS_COOKIE, tokens.accessToken, {
    ...baseOptions(),
    path: '/',
    maxAge: ACCESS_TOKEN_TTL_SECONDS,
  });
  reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseOptions(),
    path: REFRESH_PATH,
    maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
  });
}

export function clearAuthCookies(reply: FastifyReply) {
  reply.clearCookie(ACCESS_COOKIE, { ...baseOptions(), path: '/' });
  reply.clearCookie(REFRESH_COOKIE, { ...baseOptions(), path: REFRESH_PATH });
}
