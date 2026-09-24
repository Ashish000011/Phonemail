import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  authResultSchema,
  otpRequestBodySchema,
  otpRequestResponseSchema,
  otpVerifyBodySchema,
  passwordChangeBodySchema,
  passwordLoginBodySchema,
} from '@phonemail/shared';
import { env } from '../../config/env.js';
import { db } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { requestMeta } from '../../lib/request-meta.js';
import { authMode, kv, otpDelivery, otpService } from '../../services.js';
import { normalizePhone } from '../addressing/index.js';
import { recordAuthEvent } from '../accounts/auth-events.js';
import { channelForClient, createAccount } from '../accounts/service.js';
import { toMeDto } from '../users/dto.js';
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from './cookies.js';
import { currentAuth, requireAuth } from './guard.js';
import { OTP_RESEND_COOLDOWN_SECONDS } from './otp.js';
import { hashPassword, verifyPassword } from './passwords.js';
import {
  createSession,
  findSessionByRefreshToken,
  revokeOtherSessions,
  revokeSession,
  rotateSession,
} from './sessions.js';

/** Failed password logins allowed per number in 15 minutes. */
const PASSWORD_FAILS_LIMIT = 10;
const PASSWORD_FAILS_WINDOW_SECONDS = 15 * 60;

function assertOtpEnabled() {
  if (authMode === 'password') {
    throw new AppError(400, 'OTP_UNAVAILABLE', 'Sign in with your password.');
  }
}

function assertPasswordEnabled() {
  if (authMode === 'otp') {
    throw new AppError(400, 'PASSWORD_LOGIN_DISABLED', 'Sign in with a code sent by SMS.');
  }
}

/** Sign-in for the web and mobile clients (docs/spec/03-auth-and-accounts.md). */
export async function authRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const tags = ['auth'];

  app.post(
    '/api/auth/otp/request',
    {
      schema: {
        tags,
        summary: 'Send a sign-in code by SMS',
        body: otpRequestBodySchema,
        response: { 200: otpRequestResponseSchema },
      },
    },
    async (request) => {
      assertOtpEnabled();
      const phone = normalizePhone(request.body.phone, env.DEFAULT_COUNTRY);
      const meta = requestMeta(request);
      await otpService.checkRequestLimits(phone.e164, meta.ip);

      const existing = await db.user.findUnique({ where: { phoneE164: phone.e164 } });
      const { demoCode } = await otpDelivery.send(phone.e164, 'login', existing?.id);
      await recordAuthEvent({
        type: 'otp_requested',
        userId: existing?.id,
        phoneE164: phone.e164,
        channel: 'login',
        ...meta,
      });
      return { phoneE164: phone.e164, resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS, demoCode };
    },
  );

  app.post(
    '/api/auth/otp/verify',
    {
      schema: {
        tags,
        summary: 'Check the code, sign in, and create the account if it is new',
        body: otpVerifyBodySchema,
        response: { 200: authResultSchema },
      },
    },
    async (request, reply) => {
      assertOtpEnabled();
      const { code, client, tosVersion } = request.body;
      const phone = normalizePhone(request.body.phone, env.DEFAULT_COUNTRY);
      const meta = requestMeta(request);

      try {
        await otpDelivery.check(phone.e164, 'login', code);
      } catch (err) {
        await recordAuthEvent({
          type: 'otp_failed',
          phoneE164: phone.e164,
          channel: client,
          ...meta,
        });
        throw err;
      }

      const { user, created } = await createAccount({
        phone: phone.e164,
        channel: channelForClient(client),
        tosVersion,
        meta,
      });
      await recordAuthEvent({ type: 'otp_verified', userId: user.id, channel: client, ...meta });
      setAuthCookies(reply, await createSession(user.id, client, meta));
      return { user: toMeDto(user), created };
    },
  );

  app.post(
    '/api/auth/password/login',
    {
      schema: {
        tags,
        summary: 'Sign in with a password (creates the account if the number is new)',
        body: passwordLoginBodySchema,
        response: { 200: authResultSchema },
      },
    },
    async (request, reply) => {
      assertPasswordEnabled();
      const { password, client, tosVersion } = request.body;
      const phone = normalizePhone(request.body.phone, env.DEFAULT_COUNTRY);
      const meta = requestMeta(request);

      const failKey = `pwd:fails:${phone.e164}`;
      if (Number((await kv.get(failKey)) ?? 0) >= PASSWORD_FAILS_LIMIT) {
        throw new AppError(429, 'RATE_LIMITED', 'Too many attempts. Try again later.', {
          retryAfterSeconds: await kv.ttl(failKey),
        });
      }

      let user = await db.user.findUnique({ where: { phoneE164: phone.e164 } });
      let created = false;
      if (!user) {
        // Password mode can't prove the number belongs to you; that is the
        // trade-off of the fallback, and why OTP is the default.
        ({ user, created } = await createAccount({
          phone: phone.e164,
          channel: channelForClient(client),
          tosVersion,
          passwordHash: await hashPassword(password),
          meta,
        }));
      } else if (!user.passwordHash) {
        throw new AppError(400, 'PASSWORD_NOT_SET', 'This account signs in with a code.');
      } else if (!(await verifyPassword(user.passwordHash, password))) {
        await kv.increment(failKey, PASSWORD_FAILS_WINDOW_SECONDS);
        throw new AppError(401, 'PASSWORD_WRONG', 'Wrong number or password.');
      }

      setAuthCookies(reply, await createSession(user.id, client, meta));
      return { user: toMeDto(user), created };
    },
  );

  app.post(
    '/api/auth/password/change',
    {
      preHandler: requireAuth,
      schema: {
        tags,
        summary: 'Set or change the password',
        body: passwordChangeBodySchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const { userId } = currentAuth(request);
      const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
      // The current password is needed, except for a first-login temporary PIN.
      if (user.passwordHash && !user.mustChangePassword) {
        const ok =
          request.body.currentPassword !== undefined &&
          (await verifyPassword(user.passwordHash, request.body.currentPassword));
        if (!ok) throw new AppError(401, 'PASSWORD_WRONG', 'Your current password is not right.');
      }
      await db.user.update({
        where: { id: userId },
        data: {
          passwordHash: await hashPassword(request.body.newPassword),
          mustChangePassword: false,
        },
      });
      await recordAuthEvent({ type: 'password_changed', userId, ...requestMeta(request) });
      return reply.status(204).send(null);
    },
  );

  app.post(
    '/api/auth/refresh',
    {
      schema: {
        tags,
        summary: 'Swap the refresh cookie for new tokens',
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (request, reply) => {
      const token = request.cookies[REFRESH_COOKIE];
      if (!token) throw new AppError(401, 'SESSION_EXPIRED', 'Please sign in again.');
      try {
        setAuthCookies(reply, await rotateSession(token, requestMeta(request)));
        return { ok: true as const };
      } catch (err) {
        // A race keeps the cookies: the parallel request already set new ones.
        if (!(err instanceof AppError && err.code === 'REFRESH_RACE')) clearAuthCookies(reply);
        throw err;
      }
    },
  );

  app.post(
    '/api/auth/logout',
    { schema: { tags, summary: 'Sign out this device', response: { 204: z.null() } } },
    async (request, reply) => {
      const token = request.cookies[REFRESH_COOKIE];
      const session = token ? await findSessionByRefreshToken(token) : null;
      if (session) {
        await revokeSession(session.id, session.userId);
        await recordAuthEvent({ type: 'logout', userId: session.userId, ...requestMeta(request) });
      }
      clearAuthCookies(reply);
      return reply.status(204).send(null);
    },
  );

  app.post(
    '/api/auth/logout-others',
    {
      preHandler: requireAuth,
      schema: {
        tags,
        summary: 'Sign out every other device',
        response: { 200: z.object({ revoked: z.number() }) },
      },
    },
    async (request) => {
      const { userId, sessionId } = currentAuth(request);
      const revoked = await revokeOtherSessions(userId, sessionId);
      await recordAuthEvent({
        type: 'session_revoked',
        userId,
        channel: 'others',
        ...requestMeta(request),
      });
      return { revoked };
    },
  );
}
