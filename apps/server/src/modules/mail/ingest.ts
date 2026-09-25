import { randomUUID } from 'node:crypto';
import { simpleParser, type AddressObject, type EmailAddress } from 'mailparser';
import type { DeliveryState, Direction, Prisma } from '@prisma/client';
import { env } from '../../config/env.js';
import { db, isUniqueViolation } from '../../lib/db.js';
import { publishEvent } from '../../lib/events.js';
import { sanitizeFilename, sniffContentType } from '../../lib/files.js';
import { getQueue, QUEUES } from '../../lib/queue.js';
import {
  formatAddress,
  isValidEmail,
  parseAddress,
  participantKey,
  userIdentity,
  userIdFromIdentity,
  type IdentityKey,
} from '../addressing/index.js';
import { conversationFor, identityForAddress, type KeyingResult } from '../conversations/keying.js';
import { isSpam, spamScore } from '../mailbox/spam.js';
import { countLinks, htmlToPlainText, makeSnippet } from './content.js';
import { lookupLocalParts, SYSTEM_LOCAL_PARTS } from './directory.js';
import { sanitizeEmailHtml } from './sanitize.js';
import { saveAttachmentFile, saveRawMessage } from './storage.js';

/**
 * The ingest pipeline (docs/spec/04-mail-engine.md). Every email goes through
 * here exactly once, however it arrived: from another mail server, sent in our
 * apps (through our SMTP server), or a system email like the welcome message.
 *
 *   parse → store raw → sanitize → thread → find local recipients →
 *   save message + one mailbox entry per local user, each filed into a chat →
 *   after commit: live events, relay jobs for outside recipients
 */

export interface IngestInput {
  raw: Buffer;
  /** SMTP envelope: who it is really delivered to (this includes Bcc). */
  envelope: { mailFrom: string | null; rcptTo: string[] };
  /** Set when a signed-in PhoneMail user sent it (authenticated SMTP). */
  senderUserId?: string;
  /** Welcome mail and bounce notices: never spam. */
  system?: boolean;
  /** Arrival time; only seed data sets this (to spread demo mail over a week). */
  receivedAt?: Date;
  /** Seed data: store it, but no live events, alerts or relay jobs. */
  quiet?: boolean;
}

export interface IngestResult {
  messageId: string;
  /** Known Message-ID: nothing new was stored except missing copies. */
  duplicate: boolean;
  deliveredUserIds: string[];
  externalRecipients: string[];
}

export interface DeliveredEntry {
  entryId: string;
  userId: string;
  messageId: string;
  conversationId: string;
  direction: Direction;
  isSpam: boolean;
  senderUserId: string | null;
  /** Welcome mail and bounce notices (these never trigger SMS alerts). */
  system: boolean;
}

type DeliveredListener = (entry: DeliveredEntry) => Promise<void>;
const deliveredListeners: DeliveredListener[] = [];

/** Other modules react to new copies without the pipeline knowing them (SMS alerts, Phase 3). */
export function onEntryDelivered(listener: DeliveredListener) {
  deliveredListeners.push(listener);
}

interface Person {
  name: string | null;
  address: string;
}

/** Flattens mailparser's address objects (including groups) into plain lists. */
function people(value: AddressObject | AddressObject[] | undefined): Person[] {
  const flat = (items: EmailAddress[]): Person[] =>
    items.flatMap((item) =>
      item.group
        ? flat(item.group)
        : item.address && isValidEmail(item.address)
          ? [{ name: item.name || null, address: item.address.toLowerCase() }]
          : [],
    );
  const objects = Array.isArray(value) ? value : value ? [value] : [];
  return objects.flatMap((o) => flat(o.value));
}

function asList(value: string | string[] | undefined): string[] {
  return Array.isArray(value) ? value : value ? value.split(/\s+/).filter(Boolean) : [];
}

/** Dates from other servers can be wrong; never trust one from the future. */
function sensibleDate(date: Date | undefined, fallback: Date): Date {
  if (!date || Number.isNaN(date.getTime())) return fallback;
  return date.getTime() > fallback.getTime() + 60 * 60 * 1000 ? fallback : date;
}

export async function ingestMessage(input: IngestInput, attempt = 0): Promise<IngestResult> {
  const receivedAt = input.receivedAt ?? new Date();
  const parsed = await simpleParser(input.raw, {
    keepCidLinks: true,
    skipImageLinks: true,
    skipTextLinks: true,
    skipTextToHtml: true,
  });

  // ---- 1. who is involved ----------------------------------------------------------
  const from: Person = people(parsed.from)[0] ?? {
    name: null,
    address: (input.envelope.mailFrom ?? `unknown@${env.MAIL_DOMAIN}`).toLowerCase(),
  };
  const to = people(parsed.to);
  const cc = people(parsed.cc);
  const rcptTo = [...new Set(input.envelope.rcptTo.map((a) => a.toLowerCase()))];
  const visible = new Set([...to, ...cc].map((p) => p.address));
  // The sender's own record of Bcc: envelope recipients missing from To/Cc.
  const bcc = input.senderUserId ? rcptTo.filter((a) => !visible.has(a)) : [];

  const allAddresses = [
    from.address,
    ...to.map((p) => p.address),
    ...cc.map((p) => p.address),
    ...rcptTo,
  ];
  const localParts = allAddresses
    .map((a) => parseAddress(a, env.MAIL_DOMAIN))
    .filter((p) => p?.isLocal)
    .map((p) => p!.localPart);
  const directory = await lookupLocalParts(localParts);
  const identityOf = (address: string) =>
    identityForAddress(address, env.MAIL_DOMAIN, (lp) => directory.get(lp));

  const fromIdentity = identityOf(from.address);
  const fromLocalPart = parseAddress(from.address, env.MAIL_DOMAIN);
  const fromIsSystem = Boolean(
    fromLocalPart?.isLocal && SYSTEM_LOCAL_PARTS.has(fromLocalPart.localPart),
  );
  const senderUserId = input.senderUserId ?? null;

  // Local recipients come from the envelope, which is the only place Bcc lives.
  const localRecipients = new Map<string, string | undefined>(); // userId → plus tag
  const externalRecipients: string[] = [];
  for (const address of rcptTo) {
    const parsedRcpt = parseAddress(address, env.MAIL_DOMAIN);
    const userId = parsedRcpt?.isLocal ? directory.get(parsedRcpt.localPart) : undefined;
    if (userId) {
      if (!localRecipients.has(userId)) localRecipients.set(userId, parsedRcpt?.plusTag);
    } else if (parsedRcpt && !parsedRcpt.isLocal) {
      externalRecipients.push(address);
    }
  }

  // ---- 2. content ----------------------------------------------------------------------
  const messageIdHeader = parsed.messageId || `<${randomUUID()}@${env.MAIL_DOMAIN}>`;
  const existing = await db.message.findUnique({ where: { messageIdHeader } });

  const text = (parsed.text ?? (parsed.html ? htmlToPlainText(parsed.html) : '')).trim();
  const subject = (parsed.subject ?? '').trim().slice(0, 998);
  const attachments = (parsed.attachments ?? []).map((a) => {
    const filename = sanitizeFilename(a.filename);
    return {
      id: randomUUID(),
      filename,
      content: a.content,
      contentType: sniffContentType(a.content, filename),
      contentId: a.cid ?? null,
      isInline: Boolean(a.cid) && a.contentDisposition === 'inline',
    };
  });
  const cidToUrl = Object.fromEntries(
    attachments.filter((a) => a.contentId).map((a) => [a.contentId!, `/api/attachments/${a.id}`]),
  );
  const html = parsed.html ? sanitizeEmailHtml(parsed.html, cidToUrl) : null;

  // ---- 3. threading ----------------------------------------------------------------------
  const inReplyTo = parsed.inReplyTo?.trim() || null;
  const references = asList(parsed.references);
  const parent = inReplyTo
    ? await db.message.findUnique({
        where: { messageIdHeader: inReplyTo },
        select: { id: true, threadId: true },
      })
    : null;
  // threadId = root of the References chain, else the parent's thread, else this message.
  const threadId = references[0] ?? parent?.threadId ?? messageIdHeader;

  const baseSpamSignals = {
    blocked: false,
    external: fromIdentity.startsWith('e:') && !fromIsSystem,
    knownSender: false,
    linkCount: countLinks(text, parsed.html || null),
    subject,
    text,
  };

  // Files are written before the transaction; a failed transaction leaves an unused file at worst.
  const rawPath = existing ? existing.rawPath : await saveRawMessage(input.raw);
  const storedFiles = existing
    ? []
    : await Promise.all(attachments.map((a) => saveAttachmentFile(a.content)));

  // Primary addresses for the users involved, to label chat participants.
  const userIds = [...new Set(directory.values())];
  const primaryAddress = new Map(
    (
      await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, localPart: true },
      })
    ).map((u) => [u.id, formatAddress(u.localPart, env.MAIL_DOMAIN)]),
  );
  const displayAddress = (key: IdentityKey) => {
    const userId = userIdFromIdentity(key);
    return userId ? (primaryAddress.get(userId) ?? key.slice(2)) : key.slice(2);
  };

  // Who gets a copy: the sender (outgoing) and every local recipient (incoming).
  const targets: { userId: string; direction: Direction }[] = [];
  if (senderUserId) targets.push({ userId: senderUserId, direction: 'outgoing' });
  for (const userId of localRecipients.keys()) targets.push({ userId, direction: 'incoming' });

  const outgoingState: DeliveryState = externalRecipients.length === 0 ? 'delivered' : 'sent';
  const keyingBase = {
    from: fromIdentity,
    to: to.map((p) => identityOf(p.address)),
    cc: cc.map((p) => identityOf(p.address)),
  };

  const run = () =>
    db.$transaction(
      async (tx) => {
        const messageId = existing?.id ?? randomUUID();
        if (!existing) {
          await tx.message.create({
            data: {
              id: messageId,
              messageIdHeader,
              threadId,
              inReplyToHeader: inReplyTo,
              referencesHeader: references.join(' ') || null,
              parentMessageId: parent?.id,
              fromAddress: from.address,
              fromUserId: senderUserId,
              fromName: from.name,
              subject,
              textBody: text,
              htmlSanitized: html?.html || null,
              snippet: makeSnippet(text),
              sentAt: sensibleDate(parsed.date, receivedAt),
              sizeBytes: input.raw.length,
              rawPath,
              hasAttachments: attachments.some((a) => !a.isInline),
              hasRemoteImages: html?.hasRemoteImages ?? false,
              spamScore: spamScore(baseSpamSignals),
              plusTag: [...localRecipients.values()].find(Boolean) ?? null,
              recipients: {
                create: [
                  ...to.map((p) => ({ kind: 'to' as const, address: p.address })),
                  ...cc.map((p) => ({ kind: 'cc' as const, address: p.address })),
                  ...bcc.map((address) => ({ kind: 'bcc' as const, address })),
                ].map((r) => ({ ...r, userId: userIdFromIdentity(identityOf(r.address)) })),
              },
              attachments: {
                create: attachments.map((a, i) => ({
                  id: a.id,
                  filename: a.filename,
                  contentType: a.contentType,
                  sizeBytes: a.content.length,
                  storagePath: storedFiles[i].storagePath,
                  sha256: storedFiles[i].sha256,
                  contentId: a.contentId,
                  isInline: a.isInline,
                })),
              },
            },
          });
        }

        const delivered: DeliveredEntry[] = [];
        for (const target of targets) {
          const already = await tx.mailboxEntry.findUnique({
            where: { userId_messageId_direction: { ...target, messageId } },
          });
          if (already) continue;

          const keying = conversationFor({ owner: userIdentity(target.userId), ...keyingBase });
          const conversation = await findOrCreateConversation(
            tx,
            target.userId,
            keying,
            displayAddress,
          );
          const spam =
            target.direction === 'incoming' && !input.system && target.userId !== senderUserId
              ? await checkSpam(tx, target.userId, fromIdentity, baseSpamSignals)
              : false;

          const entry = await tx.mailboxEntry.create({
            data: {
              userId: target.userId,
              messageId,
              conversationId: conversation.id,
              direction: target.direction,
              isRead: target.direction === 'outgoing',
              isSpam: spam,
              deliveryState: target.direction === 'outgoing' ? outgoingState : null,
              createdAt: receivedAt,
            },
          });
          // Spam doesn't bump a chat to the top of the list.
          if (!spam) {
            await tx.conversation.update({
              where: { id: conversation.id },
              data: { lastMessageAt: receivedAt, lastMessageId: messageId },
            });
          }
          delivered.push({
            entryId: entry.id,
            userId: target.userId,
            messageId,
            conversationId: conversation.id,
            direction: target.direction,
            isSpam: spam,
            senderUserId,
            system: input.system ?? false,
          });
        }

        // Reply once: remember that the sender answered the parent message.
        if (parent && senderUserId) {
          await tx.mailboxEntry.updateMany({
            where: { userId: senderUserId, messageId: parent.id, repliedAt: null },
            data: { repliedAt: receivedAt, replyMessageId: messageId },
          });
        }
        return { messageId, delivered };
      },
      { timeout: 15_000 },
    );

  // Two emails creating the same new chat at the same instant: the second retries once.
  let outcome: Awaited<ReturnType<typeof run>>;
  try {
    outcome = await run();
  } catch (err) {
    if (!isUniqueViolation(err) || attempt > 0) throw err;
    return ingestMessage(input, attempt + 1);
  }

  // ---- after commit ---------------------------------------------------------------------------
  const result = {
    messageId: outcome.messageId,
    duplicate: Boolean(existing),
    deliveredUserIds: outcome.delivered.map((d) => d.userId),
    externalRecipients,
  };
  if (input.quiet) return result;

  for (const entry of outcome.delivered) {
    await publishEvent({ userIds: [entry.userId], type: 'mail.delivered', payload: { ...entry } });
    for (const listener of deliveredListeners) {
      try {
        await listener(entry);
      } catch (err) {
        console.error('entry-delivered listener failed', err);
      }
    }
  }
  // Only signed-in users may send outside (the SMTP server refuses relaying otherwise).
  if (!existing && senderUserId && externalRecipients.length > 0) {
    await getQueue(QUEUES.relay).add('relay', {
      messageId: outcome.messageId,
      rawPath,
      mailFrom: input.envelope.mailFrom ?? from.address,
      recipients: externalRecipients,
      senderUserId,
    });
  }
  return result;
}

/** One chat per owner per set of people: find it, or create it with its participants. */
async function findOrCreateConversation(
  tx: Prisma.TransactionClient,
  ownerId: string,
  keying: KeyingResult,
  displayAddress: (key: IdentityKey) => string,
) {
  const key = participantKey(keying.others);
  const existing = await tx.conversation.findUnique({
    where: { ownerId_participantKeyHash: { ownerId, participantKeyHash: key.hash } },
  });
  if (existing) return existing;
  return tx.conversation.create({
    data: {
      ownerId,
      kind: keying.kind,
      participantKeyHash: key.hash,
      participantKeys: key.keys,
      participants: {
        create: key.keys.map((identityKey) => ({
          identityKey,
          userId: userIdFromIdentity(identityKey),
          address: displayAddress(identityKey),
        })),
      },
    },
  });
}

/** Blocked senders always; otherwise the score, with a discount for people you know. */
async function checkSpam(
  tx: Prisma.TransactionClient,
  userId: string,
  fromIdentity: IdentityKey,
  base: Parameters<typeof spamScore>[0],
): Promise<boolean> {
  const blocked = await tx.blockedSender.findUnique({
    where: { userId_identityKey: { userId, identityKey: fromIdentity } },
  });
  if (blocked) return true;
  // "Known" means a real (non-spam) email already sits in a chat with this sender.
  // Not just "a chat exists": the chat for this very email is created before this
  // check, and a spammer's second email would otherwise count as known.
  const knownChat = await tx.mailboxEntry.findFirst({
    where: {
      userId,
      isSpam: false,
      conversation: { participantKeys: { has: fromIdentity } },
    },
    select: { id: true },
  });
  let knownContact = false;
  const senderId = userIdFromIdentity(fromIdentity);
  if (!knownChat && senderId) {
    const sender = await tx.user.findUnique({
      where: { id: senderId },
      select: { phoneE164: true },
    });
    knownContact = Boolean(
      sender &&
      (await tx.contact.findUnique({
        where: { userId_phoneE164: { userId, phoneE164: sender.phoneE164 } },
      })),
    );
  }
  return isSpam({ ...base, knownSender: Boolean(knownChat) || knownContact });
}
