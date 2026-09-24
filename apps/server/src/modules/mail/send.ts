import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import {
  MAX_EMAIL_ATTACHMENTS_BYTES,
  MAX_RECIPIENTS,
  type SendMessageBody,
} from '@phonemail/shared';
import type { Message } from '@prisma/client';
import { env } from '../../config/env.js';
import { db } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { kv } from '../../services.js';
import { formatAddress, parseAddress } from '../addressing/index.js';
import { createSmtpToken } from '../smtp/internal-token.js';
import { replySubject } from './content.js';
import { resolveLocalAddress } from './directory.js';
import { parseRecipient } from './recipients.js';
import { removeFiles } from './storage.js';

const SENDS_PER_MINUTE = 30;

/**
 * Sends an email for a signed-in user (docs/spec/04-mail-engine.md, "Sending").
 * The server enforces every rule here; the apps only mirror them:
 * - inside a chat, recipients come from the chat (RECIPIENTS_LOCKED otherwise)
 * - a message can be replied to once per user (ALREADY_REPLIED)
 * - replies get "Re: <parent subject>" and the threading headers
 * The email then goes through our own SMTP server like any other.
 */
export async function sendMessage(
  userId: string,
  body: SendMessageBody,
): Promise<{ messageId: string; conversationId: string }> {
  if ((await kv.increment(`send:${userId}`, 60)) > SENDS_PER_MINUTE) {
    throw new AppError(429, 'RATE_LIMITED', 'You are sending too fast.', {
      retryAfterSeconds: await kv.ttl(`send:${userId}`),
    });
  }

  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    include: { aliases: { where: { deletedAt: null } } },
  });
  const ownAddress = formatAddress(user.localPart, env.MAIL_DOMAIN);
  const typedRecipients = [...(body.to ?? []), ...(body.cc ?? []), ...(body.bcc ?? [])];

  // ---- reply target -------------------------------------------------------------------
  let parent: Message | null = null;
  let parentConversationId: string | undefined;
  let replyLock: string | undefined;
  if (body.replyToMessageId) {
    const entries = await db.mailboxEntry.findMany({
      where: { userId, messageId: body.replyToMessageId },
      include: { message: true },
    });
    if (entries.length === 0) throw new AppError(404, 'NOT_FOUND', 'That email was not found.');
    if (entries.some((e) => e.repliedAt)) {
      throw new AppError(422, 'ALREADY_REPLIED', 'You have already replied to this email.');
    }
    parent = entries[0].message;
    parentConversationId = (entries.find((e) => e.direction === 'incoming') ?? entries[0])
      .conversationId;
    // Stops a double tap from sending two replies before the first is stored.
    replyLock = `reply-lock:${userId}:${parent.id}`;
    if (!(await kv.setIfAbsent(replyLock, '1', 60))) {
      throw new AppError(422, 'ALREADY_REPLIED', 'You have already replied to this email.');
    }
  }

  try {
    // ---- recipients ---------------------------------------------------------------------
    let to: string[] = [];
    let cc: string[] = [];
    let bcc: string[] = [];
    const conversationId = body.conversationId ?? parentConversationId;
    if (conversationId) {
      // Inside a chat (or replying), the chat decides who receives it.
      if (typedRecipients.length > 0) {
        throw new AppError(422, 'RECIPIENTS_LOCKED', 'To add people, start a new email from Home.');
      }
      const conversation = await db.conversation.findFirst({
        where: { id: conversationId, ownerId: userId },
        include: { participants: true },
      });
      if (!conversation) throw new AppError(404, 'NOT_FOUND', 'That chat was not found.');
      to = conversation.participants.map((p) => p.address);
      if (to.length === 0) to = [ownAddress]; // your "self" chat
    } else {
      const parse = (list: string[] | undefined) =>
        (list ?? []).map((value) => {
          const address = parseRecipient(value, env.MAIL_DOMAIN, env.DEFAULT_COUNTRY);
          if (!address) {
            throw new AppError(
              422,
              'INVALID_RECIPIENT',
              `"${value}" is not a phone number or email address.`,
              { value },
            );
          }
          return address;
        });
      // An address typed twice (or in both To and Cc) is sent to once.
      const seen = new Set<string>();
      const unique = (list: string[]) => {
        const result: string[] = [];
        for (const address of list) {
          if (seen.has(address)) continue;
          seen.add(address);
          result.push(address);
        }
        return result;
      };
      to = unique(parse(body.to));
      cc = unique(parse(body.cc));
      bcc = unique(parse(body.bcc));
      if (to.length + cc.length + bcc.length === 0) {
        throw new AppError(422, 'NO_RECIPIENTS', 'Add at least one recipient.');
      }
      for (const address of [...to, ...cc, ...bcc]) {
        if (
          parseAddress(address, env.MAIL_DOMAIN)?.isLocal &&
          !(await resolveLocalAddress(address))
        ) {
          throw new AppError(422, 'RECIPIENT_NOT_FOUND', `${address} doesn't have PhoneMail yet.`, {
            address,
          });
        }
      }
    }
    if (to.length + cc.length + bcc.length > MAX_RECIPIENTS) {
      throw new AppError(422, 'VALIDATION_FAILED', `At most ${MAX_RECIPIENTS} recipients.`);
    }

    // ---- sender address, subject, attachments ---------------------------------------------
    const aliasId = body.fromAliasId ?? user.defaultSendAsAliasId;
    const alias = aliasId ? user.aliases.find((a) => a.id === aliasId) : undefined;
    if (body.fromAliasId && !alias)
      throw new AppError(400, 'NOT_FOUND', 'That alias is not yours.');
    const fromAddress = alias ? formatAddress(alias.localPart, env.MAIL_DOMAIN) : ownAddress;
    const subject = parent ? replySubject(parent.subject) : (body.subject ?? '').trim();

    const attachmentIds = [...new Set(body.attachmentIds ?? [])];
    const uploads = attachmentIds.length
      ? await db.attachment.findMany({
          where: { id: { in: attachmentIds }, uploaderId: userId, messageId: null },
        })
      : [];
    if (uploads.length !== attachmentIds.length) {
      throw new AppError(422, 'ATTACHMENT_NOT_FOUND', 'An attachment is missing. Attach it again.');
    }
    if (uploads.reduce((sum, a) => sum + a.sizeBytes, 0) > MAX_EMAIL_ATTACHMENTS_BYTES) {
      throw new AppError(413, 'FILE_TOO_LARGE', 'Attachments are limited to 25 MB per email.');
    }

    // ---- hand it to our SMTP server as this user --------------------------------------------
    const messageIdHeader = `<${randomUUID()}@${env.MAIL_DOMAIN}>`;
    const references = parent
      ? [...(parent.referencesHeader?.split(/\s+/).filter(Boolean) ?? []), parent.messageIdHeader]
      : undefined;
    const transport = nodemailer.createTransport({
      host: env.SMTP_SUBMIT_HOST,
      port: env.SMTP_PORT,
      secure: false,
      ignoreTLS: true,
      auth: { user: userId, pass: createSmtpToken(userId, env.INTERNAL_SMTP_SECRET) },
    });
    try {
      await transport.sendMail({
        messageId: messageIdHeader,
        date: new Date(),
        from: { name: user.displayName ?? '', address: fromAddress },
        to,
        cc,
        bcc,
        subject,
        text: body.body,
        inReplyTo: parent?.messageIdHeader,
        references,
        attachments: uploads.map((a) => ({
          filename: a.filename,
          path: a.storagePath,
          contentType: a.contentType,
        })),
      });
    } catch (err) {
      throw new AppError(502, 'SEND_FAILED', 'We could not send this email. Try again.', {
        reason: err instanceof Error ? err.message : String(err),
      });
    } finally {
      transport.close();
    }

    // ---- tidy up -----------------------------------------------------------------------------
    // The uploads now live inside the stored email; the temporary copies can go.
    if (uploads.length) {
      await db.attachment.deleteMany({ where: { id: { in: attachmentIds } } });
      await removeFiles(uploads.map((a) => a.storagePath));
    }
    if (body.draftId) await db.draft.deleteMany({ where: { id: body.draftId, userId } });

    // SMTP answered 250 only after storing, so the sender's copy exists now.
    const entry = await db.mailboxEntry.findFirst({
      where: { userId, direction: 'outgoing', message: { messageIdHeader } },
      select: { messageId: true, conversationId: true },
    });
    if (!entry) throw new AppError(500, 'INTERNAL', 'The email was sent but not found.');
    return entry;
  } catch (err) {
    if (replyLock) await kv.del(replyLock);
    throw err;
  }
}
