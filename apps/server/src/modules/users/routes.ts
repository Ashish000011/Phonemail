import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { meSchema, sessionInfoSchema, updateMeBodySchema } from '@phonemail/shared';
import { env } from '../../config/env.js';
import { db } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { IMAGE_EXTENSIONS, sniffImageType, type ImageType } from '../../lib/files.js';
import { currentAuth, requireAuth } from '../auth/guard.js';
import { listActiveSessions, revokeSession } from '../auth/sessions.js';
import { recordAuthEvent } from '../accounts/auth-events.js';
import { toMeDto } from './dto.js';

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const avatarDir = () => join(env.DATA_DIR, 'avatars');
// <user uuid>-<16 hex>.<ext>: the only file names the avatar route will serve.
const AVATAR_FILE_PATTERN = /^[0-9a-f-]{36}-[0-9a-f]{16}\.(jpg|png|webp)$/;
const CONTENT_TYPES: Record<string, ImageType> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** Profile, avatar and signed-in devices (docs/spec/03-auth-and-accounts.md). */
export async function userRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const tags = ['me'];

  app.get(
    '/api/me',
    {
      preHandler: requireAuth,
      schema: { tags, summary: 'The signed-in user', response: { 200: meSchema } },
    },
    async (request) => {
      const user = await db.user.findUniqueOrThrow({ where: { id: currentAuth(request).userId } });
      return toMeDto(user);
    },
  );

  app.patch(
    '/api/me',
    {
      preHandler: requireAuth,
      schema: {
        tags,
        summary: 'Update profile and settings',
        body: updateMeBodySchema,
        response: { 200: meSchema },
      },
    },
    async (request) => {
      const { userId } = currentAuth(request);
      const { defaultSendAsAliasId, displayName, about, ...rest } = request.body;
      if (defaultSendAsAliasId) {
        const alias = await db.alias.findFirst({
          where: { id: defaultSendAsAliasId, userId, deletedAt: null },
        });
        if (!alias) throw new AppError(400, 'NOT_FOUND', 'That alias is not yours.');
      }
      const user = await db.user.update({
        where: { id: userId },
        data: {
          ...rest,
          // Empty strings clear the field.
          ...(displayName !== undefined && { displayName: displayName || null }),
          ...(about !== undefined && { about: about || null }),
          ...(defaultSendAsAliasId !== undefined && { defaultSendAsAliasId }),
        },
      });
      return toMeDto(user);
    },
  );

  app.post(
    '/api/me/avatar',
    {
      preHandler: requireAuth,
      schema: {
        tags,
        summary: 'Upload a profile photo (JPEG, PNG or WebP, max 2 MB)',
        consumes: ['multipart/form-data'],
        response: { 200: meSchema },
      },
    },
    async (request) => {
      const { userId } = currentAuth(request);
      const file = await request.file({ limits: { fileSize: AVATAR_MAX_BYTES, files: 1 } });
      if (!file) throw new AppError(400, 'FILE_INVALID', 'Choose a photo to upload.');
      const bytes = await file.toBuffer();
      const type = sniffImageType(bytes);
      if (!type || type === 'image/gif') {
        throw new AppError(400, 'FILE_INVALID', 'Use a JPEG, PNG or WebP photo.');
      }

      await mkdir(avatarDir(), { recursive: true });
      const filename = `${userId}-${randomBytes(8).toString('hex')}.${IMAGE_EXTENSIONS[type]}`;
      const path = join(avatarDir(), filename);
      await writeFile(path, bytes);

      const previous = await db.user.findUniqueOrThrow({ where: { id: userId } });
      const user = await db.user.update({ where: { id: userId }, data: { avatarPath: path } });
      if (previous.avatarPath) await rm(previous.avatarPath, { force: true });
      return toMeDto(user);
    },
  );

  app.delete(
    '/api/me/avatar',
    {
      preHandler: requireAuth,
      schema: { tags, summary: 'Remove the profile photo', response: { 200: meSchema } },
    },
    async (request) => {
      const { userId } = currentAuth(request);
      const previous = await db.user.findUniqueOrThrow({ where: { id: userId } });
      const user = await db.user.update({ where: { id: userId }, data: { avatarPath: null } });
      if (previous.avatarPath) await rm(previous.avatarPath, { force: true });
      return toMeDto(user);
    },
  );

  app.get(
    '/api/avatars/:file',
    {
      preHandler: requireAuth,
      schema: { tags, summary: 'A profile photo', params: z.object({ file: z.string() }) },
    },
    async (request, reply) => {
      const { file } = request.params;
      // Strict name check: no "../" tricks can reach other files.
      if (!AVATAR_FILE_PATTERN.test(file)) throw new AppError(404, 'NOT_FOUND', 'Not found.');
      const bytes = await readFile(join(avatarDir(), file)).catch(() => null);
      if (!bytes) throw new AppError(404, 'NOT_FOUND', 'Not found.');
      return (
        reply
          .header('Content-Type', CONTENT_TYPES[file.split('.').pop()!])
          .header('X-Content-Type-Options', 'nosniff')
          // File names change with every upload, so they can be cached for long.
          .header('Cache-Control', 'private, max-age=31536000, immutable')
          .send(bytes)
      );
    },
  );

  app.get(
    '/api/me/sessions',
    {
      preHandler: requireAuth,
      schema: { tags, summary: 'Signed-in devices', response: { 200: z.array(sessionInfoSchema) } },
    },
    async (request) => {
      const { userId, sessionId } = currentAuth(request);
      const sessions = await listActiveSessions(userId);
      return sessions.map((s) => ({
        id: s.id,
        clientType: s.clientType,
        userAgent: s.userAgent,
        lastSeenAt: s.lastSeenAt.toISOString(),
        createdAt: s.createdAt.toISOString(),
        current: s.id === sessionId,
      }));
    },
  );

  app.delete(
    '/api/me/sessions/:id',
    {
      preHandler: requireAuth,
      schema: {
        tags,
        summary: 'Sign out one device',
        params: z.object({ id: z.string().uuid() }),
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const { userId } = currentAuth(request);
      if (!(await revokeSession(request.params.id, userId))) {
        throw new AppError(404, 'NOT_FOUND', 'Not found.');
      }
      await recordAuthEvent({ type: 'session_revoked', userId, channel: 'device' });
      return reply.status(204).send(null);
    },
  );
}
