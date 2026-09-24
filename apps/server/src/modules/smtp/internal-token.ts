import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The api sends every email through our own SMTP server, logged in as the
 * sending user with a short-lived token only the api can make:
 *   "<expiry>.<HMAC(secret, userId.expiry)>"
 * Nobody outside can authenticate, so nobody outside can send as a
 * PhoneMail user (docs/spec/04-mail-engine.md).
 */
export const SMTP_TOKEN_TTL_SECONDS = 5 * 60;

function sign(userId: string, expiry: number, secret: string): string {
  return createHmac('sha256', secret).update(`${userId}.${expiry}`).digest('hex');
}

export function createSmtpToken(userId: string, secret: string, now = Date.now()): string {
  const expiry = Math.floor(now / 1000) + SMTP_TOKEN_TTL_SECONDS;
  return `${expiry}.${sign(userId, expiry, secret)}`;
}

export function verifySmtpToken(
  userId: string,
  token: string,
  secret: string,
  now = Date.now(),
): boolean {
  const [expiryText, signature] = token.split('.');
  const expiry = Number(expiryText);
  if (!Number.isInteger(expiry) || !signature || expiry < Math.floor(now / 1000)) return false;
  const expected = Buffer.from(sign(userId, expiry, secret), 'hex');
  const actual = Buffer.from(signature, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
