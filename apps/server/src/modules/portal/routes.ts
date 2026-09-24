import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  otpRequestResponseSchema,
  portalOtpRequestBodySchema,
  portalRegisterBodySchema,
  portalRegisterResponseSchema,
} from '@phonemail/shared';
import { env } from '../../config/env.js';
import { db } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { requestMeta } from '../../lib/request-meta.js';
import { authMode, otpDelivery, otpService } from '../../services.js';
import { formatAddress, normalizePhone } from '../addressing/index.js';
import { createAccount } from '../accounts/service.js';
import { hashPassword } from '../auth/passwords.js';
import { OTP_RESEND_COOLDOWN_SECONDS } from '../auth/otp.js';

function alreadyRegistered(): AppError {
  return new AppError(409, 'ALREADY_REGISTERED', 'This number already has a PhoneMail address.');
}

/**
 * The registration-only portal (/register). It creates accounts and nothing
 * else: no cookies, no session, so the next person can use the same screen.
 */
export async function portalRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const tags = ['portal'];

  app.post(
    '/api/portal/otp/request',
    {
      schema: {
        tags,
        summary: 'Send a registration code (fails if the number is already registered)',
        body: portalOtpRequestBodySchema,
        response: { 200: otpRequestResponseSchema },
      },
    },
    async (request) => {
      if (authMode === 'password') {
        throw new AppError(400, 'OTP_UNAVAILABLE', 'Register with a password.');
      }
      const phone = normalizePhone(request.body.phone, env.DEFAULT_COUNTRY);
      // Checked before sending, so no code is wasted on an existing account.
      if (await db.user.findUnique({ where: { phoneE164: phone.e164 } })) throw alreadyRegistered();
      await otpService.checkRequestLimits(phone.e164, requestMeta(request).ip);
      const { demoCode } = await otpDelivery.send(phone.e164, 'register');
      return { phoneE164: phone.e164, resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS, demoCode };
    },
  );

  app.post(
    '/api/portal/register',
    {
      schema: {
        tags,
        summary: 'Create the account with the code (or a password in password mode)',
        body: portalRegisterBodySchema,
        response: { 200: portalRegisterResponseSchema },
      },
    },
    async (request) => {
      const phone = normalizePhone(request.body.phone, env.DEFAULT_COUNTRY);
      const meta = requestMeta(request);
      let passwordHash: string | undefined;

      if ('code' in request.body) {
        if (authMode === 'password') {
          throw new AppError(400, 'OTP_UNAVAILABLE', 'Register with a password.');
        }
        await otpDelivery.check(phone.e164, 'register', request.body.code);
      } else {
        if (authMode === 'otp') {
          throw new AppError(400, 'PASSWORD_LOGIN_DISABLED', 'Register with a code.');
        }
        passwordHash = await hashPassword(request.body.password);
      }

      const { user, created } = await createAccount({
        phone: phone.e164,
        channel: 'portal',
        passwordHash,
        meta,
      });
      if (!created) throw alreadyRegistered();
      return { address: formatAddress(user.localPart, env.MAIL_DOMAIN) };
    },
  );
}
