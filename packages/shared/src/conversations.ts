import { z } from 'zod';
import { attachmentSchema, searchMessageHitSchema, startChatSchema } from './mail.js';

/** The four chips on the mobile Home screen. */
export const CONVERSATION_FILTERS = ['all', 'unread', 'attachments', 'favorites'] as const;
export const conversationFilterSchema = z.enum(CONVERSATION_FILTERS);
export type ConversationFilter = z.infer<typeof conversationFilterSchema>;

export const deliveryStateSchema = z.enum(['sending', 'sent', 'delivered', 'read', 'failed']);
export type DeliveryState = z.infer<typeof deliveryStateSchema>;

/** A photo, or a colored circle with initials, or the group icon. */
export const avatarSchema = z.object({
  kind: z.enum(['photo', 'initials', 'group', 'self']),
  url: z.string().nullable(),
  initials: z.string(),
  /** Background color for initials (white text is readable on all of them). */
  color: z.string(),
});
export type Avatar = z.infer<typeof avatarSchema>;

export const participantSchema = z.object({
  identityKey: z.string(),
  userId: z.string().nullable(),
  address: z.string(),
  name: z.string(),
  /** +91 98765 43210 for PhoneMail users */
  phoneDisplay: z.string().nullable(),
  color: z.string(),
});
export type Participant = z.infer<typeof participantSchema>;

export const conversationItemSchema = z.object({
  id: z.string(),
  kind: z.enum(['direct', 'group', 'self']),
  /** Empty for the "self" chat; the UI shows "You". */
  title: z.string(),
  /** For direct chats: the other person's address (shown under the name) */
  subtitle: z.string(),
  avatar: avatarSchema,
  participants: z.array(participantSchema),
  lastMessage: z
    .object({
      messageId: z.string(),
      snippet: z.string(),
      subject: z.string(),
      isReply: z.boolean(),
      fromMe: z.boolean(),
      fromName: z.string(),
      deliveryState: deliveryStateSchema.nullable(),
      hasAttachments: z.boolean(),
      sentAt: z.string(),
    })
    .nullable(),
  unreadCount: z.number(),
  isFavorite: z.boolean(),
  chatDraft: z.object({ subject: z.string(), body: z.string() }).nullable(),
  lastMessageAt: z.string(),
});
export type ConversationItem = z.infer<typeof conversationItemSchema>;

export const conversationPageSchema = z.object({
  items: z.array(conversationItemSchema),
  nextCursor: z.string().nullable(),
});
export type ConversationPage = z.infer<typeof conversationPageSchema>;

/** One bubble in the chat view. */
export const chatMessageSchema = z.object({
  entryId: z.string(),
  messageId: z.string(),
  threadId: z.string(),
  direction: z.enum(['incoming', 'outgoing']),
  from: z.object({ name: z.string(), address: z.string(), color: z.string() }),
  subject: z.string(),
  text: z.string(),
  /** Over 700 characters or 12 lines: clamp it and offer "Read more". */
  isLong: z.boolean(),
  isReply: z.boolean(),
  hasHtml: z.boolean(),
  attachments: z.array(attachmentSchema),
  sentAt: z.string(),
  deliveryState: deliveryStateSchema.nullable(),
  isRead: z.boolean(),
  isStarred: z.boolean(),
  repliedAt: z.string().nullable(),
  replyMessageId: z.string().nullable(),
  /** The email this one replies to (the quoted block on the bubble). */
  parent: z
    .object({
      messageId: z.string(),
      fromName: z.string(),
      subject: z.string(),
      snippet: z.string(),
      conversationId: z.string().nullable(),
      /** Set when the parent lives in another chat ("in Family") */
      conversationTitle: z.string().nullable(),
    })
    .nullable(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatMessagesPageSchema = z.object({
  /** Oldest to newest within the page */
  items: z.array(chatMessageSchema),
  /** Pass as ?before= to load older messages; null when there are none. */
  nextBefore: z.string().nullable(),
});
export type ChatMessagesPage = z.infer<typeof chatMessagesPageSchema>;

/** GET /api/search: matching chats, matching emails, and "Start a chat with …". */
export const searchResponseSchema = z.object({
  conversations: z.array(conversationItemSchema),
  messages: z.array(searchMessageHitSchema),
  startChat: startChatSchema.nullable(),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;

export const resolveConversationBodySchema = z.object({
  phoneOrAddress: z.string().trim().min(1).max(254),
});

export const patchConversationBodySchema = z.object({
  isFavorite: z.boolean().optional(),
  /** "Mark as unread": the newest incoming email becomes unread again. */
  isUnread: z.literal(true).optional(),
  title: z.string().trim().max(80).nullable().optional(),
  chatDraftSubject: z.string().max(300).nullable().optional(),
  chatDraftBody: z.string().max(100_000).nullable().optional(),
});

/** Socket.IO events the server sends (docs/spec/05-conversations.md, "Realtime"). */
export const SOCKET_EVENTS = {
  messageNew: 'message:new',
  messageUpdated: 'message:updated',
  conversationUpdated: 'conversation:updated',
  conversationRemoved: 'conversation:removed',
  demoSms: 'demo:sms',
  demoUsers: 'demo:users',
} as const;

export interface MessageNewEvent {
  conversation: ConversationItem;
  message: ChatMessage;
}
export interface MessageUpdatedEvent {
  entryIds: string[];
  changes: Partial<Pick<ChatMessage, 'isRead' | 'isStarred' | 'deliveryState'>> & {
    trashed?: boolean;
    isSpam?: boolean;
  };
}
export interface ConversationUpdatedEvent {
  conversation: ConversationItem;
}
export interface ConversationRemovedEvent {
  id: string;
}
