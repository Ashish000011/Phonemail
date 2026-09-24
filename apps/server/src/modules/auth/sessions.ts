import type { ClientType, Session } from '@prisma/client';
import { db } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import type { RequestMeta } from '../../lib/request-meta.js';
import { recordAuthEvent } from '../accounts/auth-events.js';
import { announceUsersChanged } from '../../providers/sms/log.js';
import { REFRESH_TOKEN_TTL_DAYS, hashToken, newRefreshToken, signAccessToken } from './tokens.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** lastSeenAt is refreshed at most this often, to avoid a write on every request. */
const LAST_SEEN_UPDATE_MS = 5 * 60 * 1000;
/** Two tabs refreshing at the same moment is normal, not theft. */
const REFRESH_RACE_GRACE_MS = 10 * 1000;
/** A mobile session counts as "has the app" if used within this window. */
const MOBILE_ACTIVE_WINDOW_MS = 30 * DAY_MS;

export interface IssuedTokens {
  session: Session;
  accessToken: string;
  refreshToken: string;
}

async function tokensFor(session: Session, refreshToken: string): Promise<IssuedTokens> {
  const accessToken = await signAccessToken({
    userId: session.userId,
    sessionId: session.id,
    clientType: session.clientType,
  });
  return { session, accessToken, refreshToken };
}

/** Signs a device in: a new session row plus its first pair of tokens. */
export async function createSession(
  userId: string,
  clientType: ClientType,
  meta: RequestMeta,
): Promise<IssuedTokens> {
  const refreshToken = newRefreshToken();
  const session = await db.session.create({
    data: {
      userId,
      clientType,
      refreshTokenHash: hashToken(refreshToken),
      ip: meta.ip,
      userAgent: meta.userAgent,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * DAY_MS),
    },
  });
  await recordAuthEvent({ type: 'login', userId, channel: clientType, ...meta });
  // A mobile sign-in switches SMS alerts off: the demo console shows that live.
  if (clientType !== 'web') await announceUsersChanged();
  return tokensFor(session, refreshToken);
}

function isUsable(session: Session): boolean {
  return !session.revokedAt && session.expiresAt > new Date();
}

/**
 * Exchanges a refresh token for a new pair ("rotation"). If a token that was
 * already exchanged shows up again, someone copied it: the whole session is
 * revoked, which signs out both the thief and the real user.
 */
export async function rotateSession(
  refreshToken: string,
  meta: RequestMeta,
): Promise<IssuedTokens> {
  const presentedHash = hashToken(refreshToken);
  const session = await db.session.findUnique({ where: { refreshTokenHash: presentedHash } });

  if (session) {
    if (!isUsable(session)) {
      throw new AppError(401, 'SESSION_EXPIRED', 'Please sign in again.');
    }
    const nextToken = newRefreshToken();
    // Only rotate if nobody else rotated this token in the meantime.
    const { count } = await db.session.updateMany({
      where: { id: session.id, refreshTokenHash: presentedHash },
      data: {
        previousTokenHash: presentedHash,
        refreshTokenHash: hashToken(nextToken),
        lastSeenAt: new Date(),
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });
    if (count === 0) throw new AppError(401, 'REFRESH_RACE', 'Try again.');
    return tokensFor({ ...session, lastSeenAt: new Date() }, nextToken);
  }

  const reused = await db.session.findFirst({ where: { previousTokenHash: presentedHash } });
  if (reused && !reused.revokedAt) {
    if (Date.now() - reused.updatedAt.getTime() < REFRESH_RACE_GRACE_MS) {
      throw new AppError(401, 'REFRESH_RACE', 'Try again.');
    }
    await db.session.update({ where: { id: reused.id }, data: { revokedAt: new Date() } });
    await recordAuthEvent({
      type: 'session_revoked',
      userId: reused.userId,
      channel: 'reuse',
      ...meta,
    });
    throw new AppError(401, 'SESSION_REVOKED', 'For your safety, please sign in again.');
  }
  throw new AppError(401, 'SESSION_EXPIRED', 'Please sign in again.');
}

/** The session behind an access token, if it's still valid. Touches lastSeenAt now and then. */
export async function loadActiveSession(
  sessionId: string,
  userId: string,
): Promise<Session | null> {
  const session = await db.session.findUnique({ where: { id: sessionId } });
  if (!session || session.userId !== userId || !isUsable(session)) return null;
  if (Date.now() - session.lastSeenAt.getTime() > LAST_SEEN_UPDATE_MS) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  }
  return session;
}

export async function findSessionByRefreshToken(refreshToken: string): Promise<Session | null> {
  return db.session.findUnique({ where: { refreshTokenHash: hashToken(refreshToken) } });
}

export async function revokeSession(sessionId: string, userId: string): Promise<boolean> {
  const { count } = await db.session.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count > 0) await announceUsersChanged();
  return count > 0;
}

/** "Log out of all other devices". */
export async function revokeOtherSessions(userId: string, keepSessionId: string): Promise<number> {
  const { count } = await db.session.updateMany({
    where: { userId, revokedAt: null, id: { not: keepSessionId } },
    data: { revokedAt: new Date() },
  });
  if (count > 0) await announceUsersChanged();
  return count;
}

export async function listActiveSessions(userId: string): Promise<Session[]> {
  return db.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: 'desc' },
  });
}

/**
 * The SMS alert rule hinges on this (docs/spec/06): a user "has the mobile
 * app" while they have a mobile or APK session that is valid and was used in
 * the last 30 days.
 */
export function activeMobileSessionWhere(now = new Date()) {
  return {
    clientType: { in: ['mobile', 'apk'] as ClientType[] },
    revokedAt: null,
    expiresAt: { gt: now },
    lastSeenAt: { gt: new Date(now.getTime() - MOBILE_ACTIVE_WINDOW_MS) },
  };
}

export async function hasActiveMobileSession(userId: string): Promise<boolean> {
  const count = await db.session.count({ where: { userId, ...activeMobileSessionWhere() } });
  return count > 0;
}
