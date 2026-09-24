import { createReadStream } from 'node:fs';
import type { Attachment, Draft } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  attachmentSchema,
  draftBodySchema,
  draftSchema,
  MAX_ATTACHMENT_BYTES,
  sendMessageBodySchema,
  sendMessageResponseSchema,
} from '@phonemail/shared';
import { db } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { sanitizeFilename, sniffContentType } from '../../lib/files.js';
import { currentAuth, requireAuth } from '../auth/guard.js';
import { sendMessage } from './send.js';
import { removeFiles, saveAttachmentFile } from './storage.js';

export function toAttachmentDto(a: Attachment) {
  return {
    id: a.id,
    filename: a.filename,
    contentType: a.contentType,
    sizeBytes: a.sizeBytes,
    isInline: a.isInline,
  };
}

function toDraftDto(d: Draft) {
  return {
    id: d.id,
    conversationId: d.conversationId,
    to: d.to,
    cc: d.cc,
    bcc: d.bcc,
    subject: d.subject,
    body: d.body,
    replyToMessageId: d.replyToMessageId,
    fromAliasId: d.fromAliasId,
    attachmentIds: d.attachmentIds,
    updatedAt: d.updatedAt.toISOString(),
  };
}

/** Sending, attachments and drafts (docs/spec/04-mail-engine.md). */
export async function mailRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const idParams = z.object({ id: z.string().uuid() });

  app.post(
    '/api/messages',
    {
      preHandler: requireAuth,
      schema: {
        tags: ['mail'],
        summary: 'Send an email (new, reply, or inside a chat)',
        body: sendMessageBodySchema,
        response: { 200: sendMessageResponseSchema },
      },
    },
    async (request) => sendMessage(currentAuth(request).userId, request.body),
  );

  // ---- attachments ------------------------------------------------------------------------

  app.post(
    '/api/attachments',
    {
      preHandler: requireAuth,
      schema: {
        tags: ['mail'],
        summary: 'Upload files to attach (20 MB each); send their ids with the email',
        consumes: ['multipart/form-data'],
        response: { 201: z.array(attachmentSchema) },
      },
    },
    async (request, reply) => {
      const { userId } = currentAuth(request);
      const saved = [];
      for await (const part of request.files({
        limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 10 },
      })) {
        const content = await part.toBuffer();
        const filename = sanitizeFilename(part.filename);
        const { storagePath, sha256 } = await saveAttachmentFile(content);
        const row = await db.attachment.create({
          data: {
            uploaderId: userId,
            filename,
            // The real type, from the bytes. The browser's claim is ignored.
            contentType: sniffContentType(content, filename),
            sizeBytes: content.length,
            storagePath,
            sha256,
          },
        });
        saved.push(toAttachmentDto(row));
      }
      if (saved.length === 0) throw new AppError(400, 'FILE_INVALID', 'Choose a file to attach.');
      return reply.status(201).send(saved);
    },
  );

  app.get(
    '/api/attachments/:id',
    {
      preHandler: requireAuth,
      schema: { tags: ['mail'], summary: 'Download an attachment', params: idParams },
    },
    async (request, reply) => {
      const { userId } = currentAuth(request);
      const attachment = await db.attachment.findUnique({ where: { id: request.params.id } });
      // You may open it if it's your own unsent upload, or it belongs to an email in your mailbox.
      const allowed = attachment
        ? attachment.messageId
          ? await db.mailboxEntry.findFirst({
              where: { userId, messageId: attachment.messageId },
              select: { id: true },
            })
          : attachment.uploaderId === userId
        : false;
      if (!attachment || !allowed) throw new AppError(404, 'NOT_FOUND', 'Not found.');

      const inline = attachment.contentType.startsWith('image/');
      const encodedName = encodeURIComponent(attachment.filename);
      return reply
        .header('Content-Type', attachment.contentType)
        .header('Content-Length', attachment.sizeBytes)
        .header('X-Content-Type-Options', 'nosniff')
        .header(
          'Content-Disposition',
          `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodedName}`,
        )
        .header('Cache-Control', 'private, max-age=86400')
        .send(createReadStream(attachment.storagePath));
    },
  );

  // ---- drafts ---------------------------------------------------------------------------

  const tags = ['drafts'];

  async function assertOwnsConversation(userId: string, conversationId: string | null | undefined) {
    if (!conversationId) return;
    const conversation = await db.conversation.findFirst({
      where: { id: conversationId, ownerId: userId },
      select: { id: true },
    });
    if (!conversation) throw new AppError(404, 'NOT_FOUND', 'That chat was not found.');
  }

  app.get(
    '/api/drafts',
    {
      preHandler: requireAuth,
      schema: { tags, summary: 'My drafts', response: { 200: z.array(draftSchema) } },
    },
    async (request) => {
      const drafts = await db.draft.findMany({
        where: { userId: currentAuth(request).userId },
        orderBy: { updatedAt: 'desc' },
      });
      return drafts.map(toDraftDto);
    },
  );

  app.get(
    '/api/drafts/:id',
    {
      preHandler: requireAuth,
      schema: { tags, summary: 'One draft', params: idParams, response: { 200: draftSchema } },
    },
    async (request) => {
      const draft = await db.draft.findFirst({
        where: { id: request.params.id, userId: currentAuth(request).userId },
      });
      if (!draft) throw new AppError(404, 'NOT_FOUND', 'Not found.');
      return toDraftDto(draft);
    },
  );

  app.post(
    '/api/drafts',
    {
      preHandler: requireAuth,
      schema: {
        tags,
        summary: 'Save a new draft',
        body: draftBodySchema,
        response: { 201: draftSchema },
      },
    },
    async (request, reply) => {
      const { userId } = currentAuth(request);
      await assertOwnsConversation(userId, request.body.conversationId);
      const draft = await db.draft.create({ data: { ...request.body, userId } });
      return reply.status(201).send(toDraftDto(draft));
    },
  );

  app.patch(
    '/api/drafts/:id',
    {
      preHandler: requireAuth,
      schema: {
        tags,
        summary: 'Autosave a draft',
        params: idParams,
        body: draftBodySchema,
        response: { 200: draftSchema },
      },
    },
    async (request) => {
      const { userId } = currentAuth(request);
      await assertOwnsConversation(userId, request.body.conversationId);
      const { count } = await db.draft.updateMany({
        where: { id: request.params.id, userId },
        data: request.body,
      });
      if (count === 0) throw new AppError(404, 'NOT_FOUND', 'Not found.');
      return toDraftDto(await db.draft.findUniqueOrThrow({ where: { id: request.params.id } }));
    },
  );

  app.delete(
    '/api/drafts/:id',
    {
      preHandler: requireAuth,
      schema: { tags, summary: 'Discard a draft', params: idParams, response: { 204: z.null() } },
    },
    async (request, reply) => {
      const { userId } = currentAuth(request);
      const draft = await db.draft.findFirst({ where: { id: request.params.id, userId } });
      if (!draft) throw new AppError(404, 'NOT_FOUND', 'Not found.');
      await db.draft.delete({ where: { id: draft.id } });
      // Its unsent uploads go too.
      const uploads = await db.attachment.findMany({
        where: { id: { in: draft.attachmentIds }, uploaderId: userId, messageId: null },
      });
      await db.attachment.deleteMany({ where: { id: { in: uploads.map((u) => u.id) } } });
      await removeFiles(uploads.map((u) => u.storagePath));
      return reply.status(204).send(null);
    },
  );
}
