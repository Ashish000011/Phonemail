import type { Prisma } from '@prisma/client';
import type { Folder, MailListItem, MailboxPage, Thread } from '@phonemail/shared';
import { db } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { publishEvent } from '../../lib/events.js';
import { emailIdentity, formatPhone, userIdentity } from '../addressing/index.js';
import { removeFiles } from '../mail/storage.js';

/**
 * The Gmail-style view of a user's mail (docs/spec/04-mail-engine.md,
 * "Folders and flags"). Every action only touches that user's own copies
 * (mailbox entries); the shared Message row goes when nobody has a copy left.
 */

export const PAGE_SIZE = 50;
/** Enough history for grouping into threads; older mail is reached by search. */
const MAX_LIST_ENTRIES = 1000;
const TRASH_DAYS = 30;

export function folderWhere(userId: string, folder: Folder): Prisma.MailboxEntryWhereInput {
  switch (folder) {
    case 'inbox':
      return { userId, direction: 'incoming', isSpam: false, trashedAt: null };
    case 'sent':
      return { userId, direction: 'outgoing', trashedAt: null };
    case 'starred':
      return { userId, isStarred: true, isSpam: false, trashedAt: null };
    case 'spam':
      return { userId, isSpam: true, trashedAt: null };
    case 'trash':
      return { userId, trashedAt: { not: null } };
  }
}

const personUser = { select: { displayName: true, phoneE164: true } } as const;

/** What to call someone: their PhoneMail name, else their number, else the name in the email. */
export function nameFor(
  user: { displayName: string | null; phoneE164: string } | null,
  fallbackName: string | null,
  address: string,
): string {
  if (user) return user.displayName || formatPhone(user.phoneE164);
  return fallbackName || address;
}

export async function listFolder(
  userId: string,
  folder: Folder,
  page: number,
): Promise<MailboxPage> {
  const entries = await db.mailboxEntry.findMany({
    where: folderWhere(userId, folder),
    orderBy: [{ message: { sentAt: 'desc' } }, { message: { createdAt: 'desc' } }],
    take: MAX_LIST_ENTRIES,
    include: {
      message: {
        select: {
          id: true,
          threadId: true,
          subject: true,
          snippet: true,
          fromAddress: true,
          fromName: true,
          sentAt: true,
          hasAttachments: true,
          fromUser: personUser,
          recipients: {
            where: { kind: { in: ['to', 'cc'] } },
            select: { address: true, user: personUser },
          },
        },
      },
    },
  });

  // Group into threads, newest first (entries are already newest first).
  const threads = new Map<string, typeof entries>();
  for (const entry of entries) {
    const list = threads.get(entry.message.threadId) ?? [];
    list.push(entry);
    threads.set(entry.message.threadId, list);
  }

  const items: MailListItem[] = [...threads.values()].map((group) => {
    const newest = group[0].message;
    const participants: MailListItem['participants'] = [];
    const add = (name: string, me: boolean) => {
      if (!participants.some((p) => p.name === name && p.me === me))
        participants.push({ name, me });
    };
    for (const entry of [...group].reverse()) {
      if (folder === 'sent') {
        for (const r of entry.message.recipients) add(nameFor(r.user, null, r.address), false);
      } else if (entry.direction === 'outgoing') {
        add('me', true);
      } else {
        const m = entry.message;
        add(nameFor(m.fromUser, m.fromName, m.fromAddress), false);
      }
    }
    return {
      threadId: newest.threadId,
      entryIds: group.map((e) => e.id),
      messageId: newest.id,
      subject: newest.subject,
      snippet: newest.snippet,
      from: { name: newest.fromName, address: newest.fromAddress },
      participants,
      count: group.length,
      isRead: group.every((e) => e.isRead),
      isStarred: group.some((e) => e.isStarred),
      hasAttachments: group.some((e) => e.message.hasAttachments),
      sentAt: newest.sentAt.toISOString(),
    };
  });

  const start = (page - 1) * PAGE_SIZE;
  return {
    items: items.slice(start, start + PAGE_SIZE),
    total: items.length,
    page,
    pageSize: PAGE_SIZE,
  };
}

export async function folderCounts(userId: string) {
  const [inboxUnread, spamUnread, drafts] = await Promise.all([
    db.mailboxEntry.count({ where: { ...folderWhere(userId, 'inbox'), isRead: false } }),
    db.mailboxEntry.count({ where: { ...folderWhere(userId, 'spam'), isRead: false } }),
    db.draft.count({ where: { userId } }),
  ]);
  return { inboxUnread, spamUnread, drafts };
}

export async function getThread(userId: string, threadId: string): Promise<Thread> {
  const entries = await db.mailboxEntry.findMany({
    where: { userId, message: { threadId } },
    // Date headers only have whole seconds, so a quick reply can tie with its
    // original; the time we stored it breaks the tie.
    orderBy: [{ message: { sentAt: 'asc' } }, { message: { createdAt: 'asc' } }],
    include: {
      message: {
        include: {
          recipients: true,
          attachments: true,
          fromUser: personUser,
        },
      },
    },
  });
  if (entries.length === 0) throw new AppError(404, 'NOT_FOUND', 'Not found.');

  // An email to yourself has two copies (sent and received); show it once.
  const seen = new Set<string>();
  const unique = entries.filter((e) => {
    if (seen.has(e.messageId)) return false;
    seen.add(e.messageId);
    return true;
  });

  return {
    threadId,
    subject: unique[0].message.subject,
    messages: unique.map((entry) => {
      const m = entry.message;
      const byKind = (kind: 'to' | 'cc' | 'bcc') =>
        m.recipients.filter((r) => r.kind === kind).map((r) => r.address);
      return {
        entryId: entry.id,
        messageId: m.id,
        conversationId: entry.conversationId,
        direction: entry.direction,
        from: { name: nameFor(m.fromUser, m.fromName, m.fromAddress), address: m.fromAddress },
        to: byKind('to'),
        cc: byKind('cc'),
        bcc: entry.direction === 'outgoing' ? byKind('bcc') : [],
        subject: m.subject,
        text: m.textBody,
        html: m.htmlSanitized,
        hasRemoteImages: m.hasRemoteImages,
        sentAt: m.sentAt.toISOString(),
        isRead: entry.isRead,
        isStarred: entry.isStarred,
        isSpam: entry.isSpam,
        trashed: entry.trashedAt !== null,
        repliedAt: entry.repliedAt?.toISOString() ?? null,
        replyMessageId: entry.replyMessageId,
        deliveryState: entry.deliveryState,
        messageIdHeader: m.messageIdHeader,
        attachments: m.attachments.map((a) => ({
          id: a.id,
          filename: a.filename,
          contentType: a.contentType,
          sizeBytes: a.sizeBytes,
          isInline: a.isInline,
        })),
      };
    }),
  };
}

// ---- actions ------------------------------------------------------------------------------

async function announce(userId: string, entryIds: string[], changes: Record<string, unknown>) {
  await publishEvent({
    userIds: [userId],
    type: 'entries.updated',
    payload: { entryIds, changes },
  });
}

export async function updateEntries(
  userId: string,
  ids: string[],
  changes: { isRead?: boolean; isStarred?: boolean },
): Promise<number> {
  const { count } = await db.mailboxEntry.updateMany({
    where: { id: { in: ids }, userId },
    data: changes,
  });
  await announce(userId, ids, changes);
  return count;
}

export async function trashEntries(userId: string, ids: string[]): Promise<number> {
  const { count } = await db.mailboxEntry.updateMany({
    where: { id: { in: ids }, userId },
    data: { trashedAt: new Date() },
  });
  await announce(userId, ids, { trashed: true });
  return count;
}

export async function restoreEntries(userId: string, ids: string[]): Promise<number> {
  const { count } = await db.mailboxEntry.updateMany({
    where: { id: { in: ids }, userId },
    data: { trashedAt: null },
  });
  await announce(userId, ids, { trashed: false });
  return count;
}

/** Removes messages (and their files) that no mailbox entry points to any more. */
export async function deleteOrphanMessages(messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) return;
  const orphans = await db.message.findMany({
    where: { id: { in: messageIds }, entries: { none: {} } },
    select: { id: true, rawPath: true, attachments: { select: { storagePath: true } } },
  });
  if (orphans.length === 0) return;
  await db.message.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } });
  await removeFiles(
    orphans.flatMap((o) => [o.rawPath, ...o.attachments.map((a) => a.storagePath)]),
  );
}

async function deleteEntries(where: Prisma.MailboxEntryWhereInput): Promise<number> {
  const doomed = await db.mailboxEntry.findMany({ where, select: { id: true, messageId: true } });
  if (doomed.length === 0) return 0;
  await db.mailboxEntry.deleteMany({ where: { id: { in: doomed.map((d) => d.id) } } });
  await deleteOrphanMessages([...new Set(doomed.map((d) => d.messageId))]);
  return doomed.length;
}

/** Only from Trash, so nothing disappears by accident. */
export async function deleteForever(userId: string, ids: string[]): Promise<number> {
  return deleteEntries({ id: { in: ids }, userId, trashedAt: { not: null } });
}

export async function emptyTrash(userId: string): Promise<number> {
  return deleteEntries({ userId, trashedAt: { not: null } });
}

/** Daily worker job: Trash keeps things for 30 days. */
export async function purgeOldTrash(): Promise<number> {
  const cutoff = new Date(Date.now() - TRASH_DAYS * 24 * 60 * 60 * 1000);
  return deleteEntries({ trashedAt: { lt: cutoff } });
}

/** Worker job: uploads that were never sent are deleted after a day. */
export async function purgeUnsentUploads(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const stale = await db.attachment.findMany({
    where: { messageId: null, createdAt: { lt: cutoff } },
    select: { id: true, storagePath: true },
  });
  await db.attachment.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
  await removeFiles(stale.map((s) => s.storagePath));
  return stale.length;
}

// ---- spam -----------------------------------------------------------------------------------

/** The senders of these entries, as identity keys. */
async function senderIdentities(userId: string, ids: string[]) {
  const entries = await db.mailboxEntry.findMany({
    where: { id: { in: ids }, userId, direction: 'incoming' },
    select: { message: { select: { fromUserId: true, fromAddress: true } } },
  });
  return [
    ...new Set(
      entries.map(({ message }) =>
        message.fromUserId ? userIdentity(message.fromUserId) : emailIdentity(message.fromAddress),
      ),
    ),
  ];
}

/** Every incoming entry of this user from one sender. */
function fromSender(userId: string, identityKey: string): Prisma.MailboxEntryWhereInput {
  const message = identityKey.startsWith('u:')
    ? { fromUserId: identityKey.slice(2) }
    : { fromAddress: identityKey.slice(2) };
  return { userId, direction: 'incoming', message };
}

/**
 * "Report spam": these emails go to Spam. With blockSender, the sender is
 * blocked and everything else from them moves to Spam too.
 */
export async function markSpam(userId: string, ids: string[], blockSender: boolean): Promise<void> {
  await db.mailboxEntry.updateMany({ where: { id: { in: ids }, userId }, data: { isSpam: true } });
  if (blockSender) {
    for (const identityKey of await senderIdentities(userId, ids)) {
      await db.blockedSender.upsert({
        where: { userId_identityKey: { userId, identityKey } },
        create: { userId, identityKey },
        update: {},
      });
      await db.mailboxEntry.updateMany({
        where: fromSender(userId, identityKey),
        data: { isSpam: true },
      });
    }
  }
  await announce(userId, ids, { isSpam: true });
}

/**
 * "Not spam": back to the inbox, and the sender is unblocked with all their
 * mail. Your own replies in those chats come back too (reporting a chat moved
 * them to Spam with it).
 */
export async function markNotSpam(userId: string, ids: string[]): Promise<void> {
  await db.mailboxEntry.updateMany({ where: { id: { in: ids }, userId }, data: { isSpam: false } });
  const chats = await db.mailboxEntry.findMany({
    where: { id: { in: ids }, userId },
    select: { conversationId: true },
    distinct: ['conversationId'],
  });
  await db.mailboxEntry.updateMany({
    where: {
      userId,
      direction: 'outgoing',
      conversationId: { in: chats.map((c) => c.conversationId) },
    },
    data: { isSpam: false },
  });
  for (const identityKey of await senderIdentities(userId, ids)) {
    await db.blockedSender.deleteMany({ where: { userId, identityKey } });
    await db.mailboxEntry.updateMany({
      where: fromSender(userId, identityKey),
      data: { isSpam: false },
    });
  }
  await announce(userId, ids, { isSpam: false });
}
