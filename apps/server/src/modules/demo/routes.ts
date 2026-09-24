import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { demoSmsSchema, demoUserSchema } from '@phonemail/shared';
import { env } from '../../config/env.js';
import { db } from '../../lib/db.js';
import { formatAddress, formatPhone } from '../addressing/index.js';
import { activeMobileSessionWhere } from '../auth/sessions.js';
import nodemailer from 'nodemailer';
import { AppError } from '../../lib/errors.js';
import { parseRecipient } from '../mail/recipients.js';
import { DEMO_PRESETS, presetEmail } from './presets.js';

/**
 * The demo console's data (docs/spec/06, "Demo console"). Registered only
 * when DEMO_MODE=true: it shows OTP codes, so it must never exist in production.
 */
export async function demoRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const tags = ['demo'];

  app.post(
    '/api/demo/send-email',
    {
      schema: {
        tags,
        summary: 'Send an email into PhoneMail from an outside address, over real SMTP',
        body: z.object({
          preset: z.enum(DEMO_PRESETS),
          to: z.string().trim().min(1).max(254),
        }),
        response: { 200: z.object({ ok: z.literal(true), response: z.string() }) },
      },
    },
    async (request) => {
      const to = parseRecipient(request.body.to, env.MAIL_DOMAIN, env.DEFAULT_COUNTRY);
      if (!to) throw new AppError(422, 'INVALID_RECIPIENT', 'Enter a phone number or address.');
      // No login: to our SMTP server this looks exactly like another provider's server.
      const transport = nodemailer.createTransport({
        host: env.SMTP_SUBMIT_HOST,
        port: env.SMTP_PORT,
        secure: false,
        ignoreTLS: true,
      });
      try {
        const info = await transport.sendMail({ ...presetEmail(request.body.preset), to });
        return { ok: true as const, response: info.response ?? '250 OK' };
      } catch (err) {
        // Show what the SMTP server said, e.g. "550 5.1.1 No such user".
        throw new AppError(422, 'SEND_FAILED', err instanceof Error ? err.message : String(err));
      } finally {
        transport.close();
      }
    },
  );

  app.get(
    '/api/demo/sms',
    {
      schema: {
        tags,
        summary: 'Latest SMS and OTP attempts',
        querystring: z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }),
        response: { 200: z.array(demoSmsSchema) },
      },
    },
    async (request) => {
      const rows = await db.smsLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: request.query.limit,
      });
      return rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        toE164: r.toE164,
        body: r.body,
        purpose: r.purpose,
        provider: r.provider,
        status: r.status,
        error: r.error,
      }));
    },
  );

  app.get(
    '/api/demo/users',
    {
      schema: {
        tags,
        summary: 'Every account and whether it gets SMS alerts',
        response: { 200: z.array(demoUserSchema) },
      },
    },
    async () => {
      const users = await db.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { sessions: { where: activeMobileSessionWhere(), select: { id: true }, take: 1 } },
      });
      return users.map((u) => {
        const hasMobileSession = u.sessions.length > 0;
        return {
          id: u.id,
          phoneDisplay: formatPhone(u.phoneE164),
          address: formatAddress(u.localPart, env.MAIL_DOMAIN),
          registrationChannel: u.registrationChannel,
          hasMobileSession,
          getsSmsAlerts: !hasMobileSession,
          createdAt: u.createdAt.toISOString(),
        };
      });
    },
  );
}
