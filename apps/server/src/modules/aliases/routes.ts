import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { aliasCheckResponseSchema, aliasSchema, createAliasBodySchema } from '@phonemail/shared';
import type { Alias } from '@prisma/client';
import { env } from '../../config/env.js';
import { db } from '../../lib/db.js';
import { formatAddress } from '../addressing/index.js';
import { currentAuth, requireAuth } from '../auth/guard.js';
import { checkAliasAvailability, createAlias, deleteAlias, listAliases } from './service.js';

function toAliasDto(alias: Alias, defaultAliasId: string | null) {
  return {
    id: alias.id,
    localPart: alias.localPart,
    address: formatAddress(alias.localPart, env.MAIL_DOMAIN),
    isDefault: alias.id === defaultAliasId,
    createdAt: alias.createdAt.toISOString(),
  };
}

/** Extra addresses for one account (docs/spec/02-data-model.md, Aliases). */
export async function aliasRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const tags = ['aliases'];

  const defaultAliasId = async (userId: string) =>
    (await db.user.findUniqueOrThrow({ where: { id: userId } })).defaultSendAsAliasId;

  app.get(
    '/api/aliases',
    {
      preHandler: requireAuth,
      schema: { tags, summary: 'My aliases', response: { 200: z.array(aliasSchema) } },
    },
    async (request) => {
      const { userId } = currentAuth(request);
      const [aliases, defaultId] = await Promise.all([listAliases(userId), defaultAliasId(userId)]);
      return aliases.map((a) => toAliasDto(a, defaultId));
    },
  );

  app.get(
    '/api/aliases/check',
    {
      preHandler: requireAuth,
      schema: {
        tags,
        summary: 'Is this alias available? (live check while typing)',
        querystring: z.object({ localPart: z.string().max(64) }),
        response: { 200: aliasCheckResponseSchema },
      },
    },
    async (request) => {
      const result = await checkAliasAvailability(
        currentAuth(request).userId,
        request.query.localPart,
      );
      return result.available ? { available: true } : { available: false, reason: result.reason };
    },
  );

  app.post(
    '/api/aliases',
    {
      preHandler: requireAuth,
      schema: {
        tags,
        summary: 'Add an alias',
        body: createAliasBodySchema,
        response: { 201: aliasSchema },
      },
    },
    async (request, reply) => {
      const { userId } = currentAuth(request);
      const alias = await createAlias(userId, request.body.localPart);
      return reply.status(201).send(toAliasDto(alias, await defaultAliasId(userId)));
    },
  );

  app.delete(
    '/api/aliases/:id',
    {
      preHandler: requireAuth,
      schema: {
        tags,
        summary: 'Delete an alias (held for 30 days before anyone else can take it)',
        params: z.object({ id: z.string().uuid() }),
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await deleteAlias(currentAuth(request).userId, request.params.id);
      return reply.status(204).send(null);
    },
  );
}
