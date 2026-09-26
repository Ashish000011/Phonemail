import type { Conversation, ConversationParticipant, Prisma } from '@prisma/client';
import type {
  BlockedSender,
  ChatMessage,
  ChatMessagesPage,
  ConversationFilter,
  ConversationItem,
  ConversationPage,
} from '@phonemail/shared';
import { env } from '../../config/env.js';
import { db } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { publishEvent } from '../../lib/events.js';
import {
  emailIdentity,
  formatAddress,
  formatPhone,
  parseAddress,
  participantKey,
  userIdentity,
  userIdFromIdentity,
  type IdentityKey,
} from '../addressing/index.js';
import { resolveLocalAddress } from '../mail/directory.js';
import { parseRecipient } from '../mail/recipients.js';
import { avatarUrl } from '../users/dto.js';
import {
  colorFor,
  conversationTitle,
  decodeCursor,
  encodeCursor,
  initialsFor,
  isLongText,
  personName,
  type PersonInfo,
} from './presenter.js';

/**
 * Chats for the mobile client (docs/spec/05-conversations.md). A chat is shown
 * while it has at least one copy that isn't trashed or spam.
 */
const PAGE_SIZE = 30;
const MESSAGES_PAGE = 40;
const VISIBLE: Prisma.MailboxEntryWhereInput = { trashedAt: null, isSpam: false };

type ConversationWithPeople = Conversation & { participants: ConversationParticipant[] };

/** Everything needed to name people in the owner's chats, in three queries. */
async function loadPeople(ownerId: string, keys: string[]): Promise<Map<string, PersonInfo>> {
  const userIds = [...new Set(keys.map(userIdFromIdentity).filter(Boolean) as string[])];
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, displayName: true, phoneE164: true, avatarPath: true, localPart: true },
  });
  const contacts = await db.contact.findMany({
    where: { userId: ownerId, phoneE164: { in: users.map((u) => u.phoneE164) } },
  });
  const contactByPhone = new Map(contacts.map((c) => [c.phoneE164, c.name]));
  const userById = new Map(users.map((u) => [u.id, u]));

  const people = new Map<string, PersonInfo>();
  for (const key of new Set(keys)) {
    const user = userById.get(userIdFromIdentity(key) ?? '');
    people.set(key, {
      identityKey: key,
      userId: user?.id ?? null,
      address: user ? formatAddress(user.localPart, env.MAIL_DOMAIN) : key.slice(2),
      displayName: user?.displayName ?? null,
      phoneE164: user?.phoneE164 ?? null,
      avatarPath: user?.avatarPath ?? null,
      contactName: user ? (contactByPhone.get(user.phoneE164) ?? null) : null,
    });
  }
  return people;
}

function senderKey(message: { fromUserId: string | null; fromAddress: string }): IdentityKey {
  return message.fromUserId ? userIdentity(message.fromUserId) : emailIdentity(message.fromAddress);
}

/** Turns chats into list items (title, avatar, last message, unread count). */
export async function presentConversations(
  ownerId: string,
  conversations: ConversationWithPeople[],
): Promise<ConversationItem[]> {
  if (conversations.length === 0) return [];
  const ids = conversations.map((c) => c.id);

  const [lastEntries, unread] = await Promise.all([
    db.mailboxEntry.findMany({
      where: { userId: ownerId, conversationId: { in: ids }, ...VISIBLE },
      orderBy: { createdAt: 'desc' },
      distinct: ['conversationId'],
      include: {
        message: {
          select: {
            id: true,
            subject: true,
            snippet: true,
            sentAt: true,
            hasAttachments: true,
            parentMessageId: true,
            inReplyToHeader: true,
            fromUserId: true,
            fromAddress: true,
            fromName: true,
          },
        },
      },
    }),
    db.mailboxEntry.groupBy({
      by: ['conversationId'],
      where: {
        userId: ownerId,
        conversationId: { in: ids },
        direction: 'incoming',
        isRead: false,
        ...VISIBLE,
      },
      _count: { _all: true },
    }),
  ]);
  const lastByConversation = new Map(lastEntries.map((e) => [e.conversationId, e]));
  const unreadByConversation = new Map(unread.map((u) => [u.conversationId, u._count._all]));

  const allKeys = conversations.flatMap((c) => c.participants.map((p) => p.identityKey));
  for (const e of lastEntries) allKeys.push(senderKey(e.message));
  const people = await loadPeople(ownerId, allKeys);

  return conversations.map((c) => {
    const members = c.participants.map((p) => people.get(p.identityKey)!).filter(Boolean);
    const title = conversationTitle(c.kind, c.title, members);
    const first = members[0];
    const avatar =
      c.kind === 'group'
        ? { kind: 'group' as const, url: null, initials: '', color: colorFor(c.id) }
        : c.kind === 'self'
          ? { kind: 'self' as const, url: null, initials: '', color: colorFor(c.ownerId) }
          : first?.avatarPath
            ? {
                kind: 'photo' as const,
                url: avatarUrl(first.avatarPath),
                initials: initialsFor(title),
                color: colorFor(first.identityKey),
              }
            : {
                kind: 'initials' as const,
                url: null,
                initials: initialsFor(title),
                color: colorFor(first?.identityKey ?? c.id),
              };

    const last = lastByConversation.get(c.id);
    const lastSender = last ? people.get(senderKey(last.message)) : undefined;
    return {
      id: c.id,
      kind: c.kind,
      title,
      subtitle:
        c.kind === 'direct' ? (first?.address ?? '') : members.map((m) => personName(m)).join(', '),
      avatar,
      participants: members.map((m) => ({
        identityKey: m.identityKey,
        userId: m.userId,
        address: m.address,
        name: personName(m),
        phoneDisplay: m.phoneE164 ? formatPhone(m.phoneE164) : null,
        color: colorFor(m.identityKey),
      })),
      lastMessage: last
        ? {
            messageId: last.message.id,
            snippet: last.message.snippet,
            subject: last.message.subject,
            isReply: Boolean(last.message.parentMessageId || last.message.inReplyToHeader),
            fromMe: last.direction === 'outgoing',
            fromName: lastSender
              ? personName(lastSender)
              : (last.message.fromName ?? last.message.fromAddress),
            deliveryState: last.deliveryState,
            hasAttachments: last.message.hasAttachments,
            sentAt: last.message.sentAt.toISOString(),
          }
        : null,
      unreadCount: unreadByConversation.get(c.id) ?? 0,
      isFavorite: c.isFavorite,
      chatDraft:
        c.chatDraftSubject || c.chatDraftBody
          ? { subject: c.chatDraftSubject ?? '', body: c.chatDraftBody ?? '' }
          : null,
      lastMessageAt: c.lastMessageAt.toISOString(),
    };
  });
}

function filterWhere(ownerId: string, filter: ConversationFilter): Prisma.ConversationWhereInput {
  const visible = { entries: { some: { userId: ownerId, ...VISIBLE } } };
  switch (filter) {
    case 'all':
      return visible;
    case 'unread':
      return {
        entries: { some: { userId: ownerId, direction: 'incoming', isRead: false, ...VISIBLE } },
      };
    case 'attachments':
      return {
        entries: { some: { userId: ownerId, ...VISIBLE, message: { hasAttachments: true } } },
      };
    case 'favorites':
      return { ...visible, isFavorite: true };
  }
}

export async function listConversations(
  ownerId: string,
  filter: ConversationFilter,
  cursor?: string,
): Promise<ConversationPage> {
  const after = cursor ? decodeCursor(cursor) : null;
  const conversations = await db.conversation.findMany({
    where: {
      ownerId,
      ...filterWhere(ownerId, filter),
      ...(after && {
        OR: [
          { lastMessageAt: { lt: after.at } },
          { lastMessageAt: after.at, id: { lt: after.id } },
        ],
      }),
    },
    orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
    take: PAGE_SIZE + 1,
    include: { participants: true },
  });
  const page = conversations.slice(0, PAGE_SIZE);
  const last = page[page.length - 1];
  return {
    items: await presentConversations(ownerId, page),
    nextCursor:
      conversations.length > PAGE_SIZE && last ? encodeCursor(last.lastMessageAt, last.id) : null,
  };
}

async function ownedConversation(ownerId: string, id: string): Promise<ConversationWithPeople> {
  const conversation = await db.conversation.findFirst({
    where: { id, ownerId },
    include: { participants: true },
  });
  if (!conversation) throw new AppError(404, 'NOT_FOUND', 'That chat was not found.');
  return conversation;
}

export async function getConversationItem(ownerId: string, id: string): Promise<ConversationItem> {
  return (await presentConversations(ownerId, [await ownedConversation(ownerId, id)]))[0];
}

/**
 * "Search a phone number to start a chat": finds or creates the 1:1 chat with
 * that number or address. It shows in the list once it has an email.
 */
export async function resolveConversation(
  ownerId: string,
  phoneOrAddress: string,
): Promise<ConversationItem> {
  const address = parseRecipient(phoneOrAddress, env.MAIL_DOMAIN, env.DEFAULT_COUNTRY);
  if (!address) {
    throw new AppError(422, 'INVALID_RECIPIENT', 'That is not a phone number or email address.');
  }
  let identity: IdentityKey = emailIdentity(address);
  if (parseAddress(address, env.MAIL_DOMAIN)?.isLocal) {
    const local = await resolveLocalAddress(address);
    if (!local) {
      throw new AppError(422, 'RECIPIENT_NOT_FOUND', `${address} doesn't have PhoneMail yet.`, {
        address,
      });
    }
    identity = userIdentity(local.userId);
  }

  const self = identity === userIdentity(ownerId);
  const key = participantKey(self ? [] : [identity]);
  const people = await loadPeople(ownerId, [identity]);
  const conversation = await db.conversation.upsert({
    where: { ownerId_participantKeyHash: { ownerId, participantKeyHash: key.hash } },
    update: {},
    create: {
      ownerId,
      kind: self ? 'self' : 'direct',
      participantKeyHash: key.hash,
      participantKeys: key.keys,
      participants: self
        ? undefined
        : {
            create: [
              {
                identityKey: identity,
                userId: userIdFromIdentity(identity),
                address: people.get(identity)!.address,
              },
            ],
          },
    },
    include: { participants: true },
  });
  return (await presentConversations(ownerId, [conversation]))[0];
}

type EntryWithMessage = Prisma.MailboxEntryGetPayload<{
  include: {
    message: {
      include: {
        attachments: true;
        parent: {
          select: {
            id: true;
            subject: true;
            snippet: true;
            fromName: true;
            fromAddress: true;
            fromUserId: true;
          };
        };
      };
    };
  };
}>;

const chatMessageInclude = {
  message: {
    include: {
      attachments: true,
      parent: {
        select: {
          id: true,
          subject: true,
          snippet: true,
          fromName: true,
          fromAddress: true,
          fromUserId: true,
        },
      },
    },
  },
} as const;

/** Bubbles for the chat view, oldest first. */
export async function presentChatMessages(
  ownerId: string,
  conversationId: string,
  entries: EntryWithMessage[],
): Promise<ChatMessage[]> {
  // A message to yourself has two copies in your "self" chat: show it once.
  const seen = new Set<string>();
  const unique = entries.filter((e) => {
    if (seen.has(e.messageId)) return false;
    seen.add(e.messageId);
    return true;
  });

  const keys = unique.flatMap((e) => [
    senderKey(e.message),
    ...(e.message.parent ? [senderKey(e.message.parent)] : []),
  ]);
  const people = await loadPeople(ownerId, keys);

  // Where the parents live for this user (a reply can quote an email from another chat).
  const parentIds = unique.map((e) => e.message.parent?.id).filter(Boolean) as string[];
  const parentEntries = await db.mailboxEntry.findMany({
    where: { userId: ownerId, messageId: { in: parentIds } },
    select: { messageId: true, conversationId: true },
  });
  const parentConversation = new Map(parentEntries.map((p) => [p.messageId, p.conversationId]));
  const otherChatIds = [...new Set(parentEntries.map((p) => p.conversationId))].filter(
    (id) => id !== conversationId,
  );
  const otherChats = otherChatIds.length
    ? await presentConversations(
        ownerId,
        await db.conversation.findMany({
          where: { id: { in: otherChatIds } },
          include: { participants: true },
        }),
      )
    : [];
  const otherChatTitle = new Map(otherChats.map((c) => [c.id, c.title]));

  return unique.map((entry) => {
    const m = entry.message;
    const key = senderKey(m);
    const sender = people.get(key);
    const parent = m.parent;
    const parentChat = parent ? (parentConversation.get(parent.id) ?? null) : null;
    return {
      entryId: entry.id,
      messageId: m.id,
      threadId: m.threadId,
      direction: entry.direction,
      from: {
        name: sender ? personName(sender) : (m.fromName ?? m.fromAddress),
        address: m.fromAddress,
        color: colorFor(key),
      },
      subject: m.subject,
      text: m.textBody,
      isLong: isLongText(m.textBody),
      isReply: Boolean(m.parentMessageId || m.inReplyToHeader),
      hasHtml: Boolean(m.htmlSanitized),
      attachments: m.attachments
        .filter((a) => !a.isInline)
        .map((a) => ({
          id: a.id,
          filename: a.filename,
          contentType: a.contentType,
          sizeBytes: a.sizeBytes,
          isInline: a.isInline,
        })),
      sentAt: m.sentAt.toISOString(),
      deliveryState: entry.deliveryState,
      isRead: entry.isRead,
      isStarred: entry.isStarred,
      repliedAt: entry.repliedAt?.toISOString() ?? null,
      replyMessageId: entry.replyMessageId,
      parent: parent
        ? {
            messageId: parent.id,
            fromName: (() => {
              const p = people.get(senderKey(parent));
              return p ? personName(p) : (parent.fromName ?? parent.fromAddress);
            })(),
            fromMe: parent.fromUserId === ownerId,
            subject: parent.subject,
            snippet: parent.snippet,
            conversationId: parentChat,
            conversationTitle:
              parentChat && parentChat !== conversationId
                ? (otherChatTitle.get(parentChat) ?? null)
                : null,
          }
        : null,
    };
  });
}

export async function listChatMessages(
  ownerId: string,
  conversationId: string,
  before?: string,
  limit = MESSAGES_PAGE,
): Promise<ChatMessagesPage> {
  await ownedConversation(ownerId, conversationId);
  const anchor = before
    ? await db.mailboxEntry.findFirst({
        where: { id: before, userId: ownerId },
        select: { createdAt: true },
      })
    : null;
  const entries = await db.mailboxEntry.findMany({
    where: {
      userId: ownerId,
      conversationId,
      ...VISIBLE,
      ...(anchor && { createdAt: { lt: anchor.createdAt } }),
    },
    // In a self chat the sent copy comes first, so it's the one shown.
    orderBy: [{ createdAt: 'desc' }, { direction: 'desc' }],
    take: limit + 1,
    include: chatMessageInclude,
  });
  const page = entries.slice(0, limit).reverse();
  return {
    items: await presentChatMessages(ownerId, conversationId, page),
    nextBefore: entries.length > limit && page[0] ? page[0].id : null,
  };
}

/** One freshly delivered bubble, for the live "message:new" event. */
export async function chatMessageForEntry(
  ownerId: string,
  entryId: string,
): Promise<ChatMessage | null> {
  const entry = await db.mailboxEntry.findFirst({
    where: { id: entryId, userId: ownerId },
    include: chatMessageInclude,
  });
  if (!entry) return null;
  return (await presentChatMessages(ownerId, entry.conversationId, [entry]))[0] ?? null;
}

/**
 * Opening a chat marks its emails read. If both people allow read receipts,
 * the sender's ticks turn blue once every PhoneMail recipient has read it.
 */
export async function markConversationRead(ownerId: string, conversationId: string): Promise<void> {
  await ownedConversation(ownerId, conversationId);
  const unread = await db.mailboxEntry.findMany({
    where: { userId: ownerId, conversationId, direction: 'incoming', isRead: false },
    select: { id: true, messageId: true },
  });
  if (unread.length === 0) return;
  await db.mailboxEntry.updateMany({
    where: { id: { in: unread.map((u) => u.id) } },
    data: { isRead: true },
  });
  await publishEvent({
    userIds: [ownerId],
    type: 'conversation.updated',
    payload: { conversationId },
  });

  const reader = await db.user.findUniqueOrThrow({
    where: { id: ownerId },
    select: { readReceipts: true },
  });
  if (!reader.readReceipts) return;
  for (const { messageId } of unread) await maybeMarkRead(messageId);
}

async function maybeMarkRead(messageId: string): Promise<void> {
  const sent = await db.mailboxEntry.findFirst({
    where: { messageId, direction: 'outgoing', deliveryState: 'delivered' },
    include: { user: { select: { readReceipts: true } } },
  });
  if (!sent || !sent.user.readReceipts) return;
  // Blue ticks only when every PhoneMail recipient (who allows receipts) has read it.
  const stillUnread = await db.mailboxEntry.count({
    where: { messageId, direction: 'incoming', isRead: false, user: { readReceipts: true } },
  });
  if (stillUnread > 0) return;
  await db.mailboxEntry.update({ where: { id: sent.id }, data: { deliveryState: 'read' } });
  await publishEvent({
    userIds: [sent.userId],
    type: 'entries.updated',
    payload: { entryIds: [sent.id], changes: { deliveryState: 'read' } },
  });
}

export async function patchConversation(
  ownerId: string,
  id: string,
  changes: {
    isFavorite?: boolean;
    isUnread?: true;
    title?: string | null;
    chatDraftSubject?: string | null;
    chatDraftBody?: string | null;
  },
): Promise<ConversationItem> {
  await ownedConversation(ownerId, id);
  const { isUnread, ...fields } = changes;
  await db.conversation.update({ where: { id }, data: fields });
  if (isUnread) {
    const newest = await db.mailboxEntry.findFirst({
      where: { userId: ownerId, conversationId: id, direction: 'incoming', ...VISIBLE },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (newest) await db.mailboxEntry.update({ where: { id: newest.id }, data: { isRead: false } });
  }
  // Draft autosaves happen every second while typing; only real changes are announced.
  if (changes.isFavorite !== undefined || changes.title !== undefined || isUnread) {
    await publishEvent({
      userIds: [ownerId],
      type: 'conversation.updated',
      payload: { conversationId: id },
    });
  }
  return getConversationItem(ownerId, id);
}

export async function trashConversation(ownerId: string, id: string): Promise<void> {
  await ownedConversation(ownerId, id);
  await db.mailboxEntry.updateMany({
    where: { userId: ownerId, conversationId: id, trashedAt: null },
    data: { trashedAt: new Date() },
  });
  await publishEvent({
    userIds: [ownerId],
    type: 'conversation.removed',
    payload: { conversationId: id },
  });
}

/**
 * Report the whole chat as spam: all its mail moves to Spam (your own replies
 * too, as in Gmail, or they would keep the chat on Home) and its people are
 * blocked.
 */
export async function spamConversation(ownerId: string, id: string): Promise<void> {
  const conversation = await ownedConversation(ownerId, id);
  await db.mailboxEntry.updateMany({
    where: { userId: ownerId, conversationId: id },
    data: { isSpam: true },
  });
  for (const p of conversation.participants) {
    await db.blockedSender.upsert({
      where: { userId_identityKey: { userId: ownerId, identityKey: p.identityKey } },
      create: { userId: ownerId, identityKey: p.identityKey },
      update: {},
    });
  }
  await publishEvent({
    userIds: [ownerId],
    type: 'conversation.removed',
    payload: { conversationId: id },
  });
}

/** The people whose mail goes straight to Spam, newest first. */
export async function listBlockedSenders(ownerId: string): Promise<BlockedSender[]> {
  const blocked = await db.blockedSender.findMany({
    where: { userId: ownerId },
    orderBy: { createdAt: 'desc' },
  });
  const people = await loadPeople(
    ownerId,
    blocked.map((b) => b.identityKey),
  );
  return blocked.map((b) => {
    const person = people.get(b.identityKey)!;
    return {
      id: b.id,
      name: personName(person),
      address: person.address,
      phoneDisplay: person.phoneE164 ? formatPhone(person.phoneE164) : null,
      blockedAt: b.createdAt.toISOString(),
    };
  });
}

/** New mail from them arrives normally again; what's already in Spam stays there. */
export async function unblockSender(ownerId: string, id: string): Promise<void> {
  const { count } = await db.blockedSender.deleteMany({ where: { id, userId: ownerId } });
  if (count === 0) throw new AppError(404, 'NOT_FOUND', 'Not found.');
}

/** Chats whose people match the search text (name, number or address). */
export async function searchConversations(ownerId: string, q: string): Promise<ConversationItem[]> {
  const text = q.trim();
  const digits = text.replace(/\D/g, '');
  const matches = await db.conversation.findMany({
    where: {
      ownerId,
      entries: { some: { userId: ownerId, ...VISIBLE } },
      OR: [
        { title: { contains: text, mode: 'insensitive' } },
        { participants: { some: { address: { contains: text, mode: 'insensitive' } } } },
        {
          participants: {
            some: { user: { displayName: { contains: text, mode: 'insensitive' } } },
          },
        },
        ...(digits.length >= 3
          ? [{ participants: { some: { user: { phoneE164: { contains: digits } } } } }]
          : []),
      ],
    },
    orderBy: { lastMessageAt: 'desc' },
    take: 10,
    include: { participants: true },
  });
  return presentConversations(ownerId, matches);
}
