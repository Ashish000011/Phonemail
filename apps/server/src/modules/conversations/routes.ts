import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  chatMessagesPageSchema,
  conversationFilterSchema,
  conversationItemSchema,
  conversationPageSchema,
  patchConversationBodySchema,
  resolveConversationBodySchema,
} from '@phonemail/shared';
import { currentAuth, requireAuth } from '../auth/guard.js';
import {
  getConversationItem,
  listChatMessages,
  listConversations,
  markConversationRead,
  patchConversation,
  resolveConversation,
  spamConversation,
  trashConversation,
} from './service.js';

/** The WhatsApp-style chat API for the mobile client (docs/spec/05-conversations.md). */
export async function conversationRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const tags = ['chats'];
  const auth = { preHandler: requireAuth };
  const idParams = z.object({ id: z.string().uuid() });

  app.get(
    '/api/conversations',
    {
      ...auth,
      schema: {
        tags,
        summary: 'Chats, newest first, 30 per page (filters: all, unread, attachments, favorites)',
        querystring: z.object({
          filter: conversationFilterSchema.default('all'),
          cursor: z.string().max(200).optional(),
        }),
        response: { 200: conversationPageSchema },
      },
    },
    async (request) =>
      listConversations(currentAuth(request).userId, request.query.filter, request.query.cursor),
  );

  app.post(
    '/api/conversations/resolve',
    {
      ...auth,
      schema: {
        tags,
        summary: 'Open (or create) the 1:1 chat with a phone number or address',
        body: resolveConversationBodySchema,
        response: { 200: conversationItemSchema },
      },
    },
    async (request) =>
      resolveConversation(currentAuth(request).userId, request.body.phoneOrAddress),
  );

  app.get(
    '/api/conversations/:id',
    {
      ...auth,
      schema: {
        tags,
        summary: 'Chat header: title, avatar, participants',
        params: idParams,
        response: { 200: conversationItemSchema },
      },
    },
    async (request) => getConversationItem(currentAuth(request).userId, request.params.id),
  );

  app.get(
    '/api/conversations/:id/messages',
    {
      ...auth,
      schema: {
        tags,
        summary: 'Bubbles, oldest to newest; pass ?before=<entryId> to load older ones',
        params: idParams,
        querystring: z.object({
          before: z.string().uuid().optional(),
          limit: z.coerce.number().int().min(1).max(100).default(40),
        }),
        response: { 200: chatMessagesPageSchema },
      },
    },
    async (request) =>
      listChatMessages(
        currentAuth(request).userId,
        request.params.id,
        request.query.before,
        request.query.limit,
      ),
  );

  app.post(
    '/api/conversations/:id/read',
    {
      ...auth,
      schema: {
        tags,
        summary: 'Mark the chat read (sends read receipts)',
        params: idParams,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await markConversationRead(currentAuth(request).userId, request.params.id);
      return reply.status(204).send(null);
    },
  );

  app.patch(
    '/api/conversations/:id',
    {
      ...auth,
      schema: {
        tags,
        summary: 'Favorite, rename a group (for you), or save the chat draft',
        params: idParams,
        body: patchConversationBodySchema,
        response: { 200: conversationItemSchema },
      },
    },
    async (request) =>
      patchConversation(currentAuth(request).userId, request.params.id, request.body),
  );

  app.post(
    '/api/conversations/:id/trash',
    {
      ...auth,
      schema: {
        tags,
        summary: 'Move the whole chat to Trash',
        params: idParams,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await trashConversation(currentAuth(request).userId, request.params.id);
      return reply.status(204).send(null);
    },
  );

  app.post(
    '/api/conversations/:id/spam',
    {
      ...auth,
      schema: {
        tags,
        summary: 'Report the whole chat as spam and block its people',
        params: idParams,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await spamConversation(currentAuth(request).userId, request.params.id);
      return reply.status(204).send(null);
    },
  );
}
