import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { demoSmsSchema, demoUserSchema } from '@phonemail/shared';
import { env } from '../../config/env.js';
import { db } from '../../lib/db.js';
import { formatAddress, formatPhone } from '../addressing/index.js';
import { activeMobileSessionWhere } from '../auth/sessions.js';

/**
 * The demo console's data (docs/spec/06, "Demo console"). Registered only
 * when DEMO_MODE=true: it shows OTP codes, so it must never exist in production.
 */
export async function demoRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const tags = ['demo'];

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
