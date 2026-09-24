import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  entryIdsBodySchema,
  folderSchema,
  mailboxPageSchema,
  patchEntriesBodySchema,
  searchMessageHitSchema,
  spamEntriesBodySchema,
  startChatSchema,
  threadSchema,
} from '@phonemail/shared';
import { currentAuth, requireAuth } from '../auth/guard.js';
import { searchMessages, startChatFor } from './search.js';
import {
  deleteForever,
  emptyTrash,
  folderCounts,
  getThread,
  listFolder,
  markNotSpam,
  markSpam,
  restoreEntries,
  trashEntries,
  updateEntries,
} from './service.js';

const countResponse = z.object({ count: z.number() });

/** Folders, threads, flags, trash, spam and search (docs/spec/04-mail-engine.md). */
export async function mailboxRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const tags = ['mailbox'];
  const auth = { preHandler: requireAuth };

  app.get(
    '/api/mailbox/:folder',
    {
      ...auth,
      schema: {
        tags,
        summary: 'A Gmail-style folder, grouped by thread, 50 per page',
        params: z.object({ folder: folderSchema }),
        querystring: z.object({ page: z.coerce.number().int().min(1).default(1) }),
        response: { 200: mailboxPageSchema },
      },
    },
    async (request) =>
      listFolder(currentAuth(request).userId, request.params.folder, request.query.page),
  );

  app.get(
    '/api/mailbox-counts',
    {
      ...auth,
      schema: {
        tags,
        summary: 'Unread and draft counts for the navigation',
        response: {
          200: z.object({ inboxUnread: z.number(), spamUnread: z.number(), drafts: z.number() }),
        },
      },
    },
    async (request) => folderCounts(currentAuth(request).userId),
  );

  app.get(
    '/api/threads/:threadId',
    {
      ...auth,
      schema: {
        tags,
        summary: 'Every message of a thread you can see (reading view)',
        params: z.object({ threadId: z.string().min(1).max(998) }),
        response: { 200: threadSchema },
      },
    },
    async (request) => getThread(currentAuth(request).userId, request.params.threadId),
  );

  app.patch(
    '/api/entries',
    {
      ...auth,
      schema: {
        tags,
        summary: 'Mark read/unread, star/unstar',
        body: patchEntriesBodySchema,
        response: { 200: countResponse },
      },
    },
    async (request) => {
      const { ids, isRead, isStarred } = request.body;
      return {
        count: await updateEntries(currentAuth(request).userId, ids, { isRead, isStarred }),
      };
    },
  );

  const idsAction = (
    path: string,
    summary: string,
    action: (userId: string, ids: string[]) => Promise<number>,
  ) =>
    app.post(
      path,
      {
        ...auth,
        schema: { tags, summary, body: entryIdsBodySchema, response: { 200: countResponse } },
      },
      async (request) => ({ count: await action(currentAuth(request).userId, request.body.ids) }),
    );

  idsAction('/api/entries/trash', 'Move to Trash', trashEntries);
  idsAction('/api/entries/restore', 'Move back out of Trash', restoreEntries);
  idsAction('/api/entries/delete-forever', 'Delete from Trash for good', deleteForever);

  app.post(
    '/api/entries/spam',
    {
      ...auth,
      schema: {
        tags,
        summary: 'Report spam (optionally block the sender)',
        body: spamEntriesBodySchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const { ids, blockSender } = request.body;
      await markSpam(currentAuth(request).userId, ids, blockSender ?? false);
      return reply.status(204).send(null);
    },
  );

  app.post(
    '/api/entries/not-spam',
    {
      ...auth,
      schema: {
        tags,
        summary: 'Not spam: back to the inbox, sender unblocked',
        body: entryIdsBodySchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await markNotSpam(currentAuth(request).userId, request.body.ids);
      return reply.status(204).send(null);
    },
  );

  app.post(
    '/api/trash/empty',
    { ...auth, schema: { tags, summary: 'Empty the Trash', response: { 200: countResponse } } },
    async (request) => ({ count: await emptyTrash(currentAuth(request).userId) }),
  );

  app.get(
    '/api/search',
    {
      ...auth,
      schema: {
        tags,
        summary: 'Search your mail; also offers "Start a chat" for numbers and addresses',
        querystring: z.object({ q: z.string().trim().min(1).max(200) }),
        response: {
          200: z.object({
            messages: z.array(searchMessageHitSchema),
            startChat: startChatSchema.nullable(),
          }),
        },
      },
    },
    async (request) => {
      const { userId } = currentAuth(request);
      const [messages, startChat] = await Promise.all([
        searchMessages(userId, request.query.q),
        startChatFor(request.query.q),
      ]);
      return { messages, startChat };
    },
  );
}
