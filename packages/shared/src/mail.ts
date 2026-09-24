import { z } from 'zod';

/** Gmail-style folders for the web client (docs/spec/04-mail-engine.md). */
export const FOLDERS = ['inbox', 'sent', 'starred', 'spam', 'trash'] as const;
export const folderSchema = z.enum(FOLDERS);
export type Folder = z.infer<typeof folderSchema>;

export const MAX_RECIPIENTS = 50;
export const MAX_BODY_CHARS = 100_000;
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_EMAIL_ATTACHMENTS_BYTES = 25 * 1024 * 1024;

const recipientList = z.array(z.string().trim().min(1).max(254)).max(MAX_RECIPIENTS);

/** POST /api/messages */
export const sendMessageBodySchema = z.object({
  /** Sending from inside a chat: recipients come from the chat and can't be changed. */
  conversationId: z.string().uuid().optional(),
  to: recipientList.optional(),
  cc: recipientList.optional(),
  bcc: recipientList.optional(),
  /** Ignored for replies ("Re: <parent subject>" is used). */
  subject: z.string().max(300).optional(),
  body: z.string().max(MAX_BODY_CHARS),
  replyToMessageId: z.string().uuid().optional(),
  fromAliasId: z.string().uuid().optional(),
  attachmentIds: z.array(z.string().uuid()).max(20).optional(),
  draftId: z.string().uuid().optional(),
});
export type SendMessageBody = z.infer<typeof sendMessageBodySchema>;

export const sendMessageResponseSchema = z.object({
  messageId: z.string(),
  conversationId: z.string(),
});

export const attachmentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  contentType: z.string(),
  sizeBytes: z.number(),
  isInline: z.boolean(),
});
export type AttachmentInfo = z.infer<typeof attachmentSchema>;

// ---- drafts -------------------------------------------------------------------------

export const draftBodySchema = z.object({
  conversationId: z.string().uuid().nullable().optional(),
  to: recipientList.optional(),
  cc: recipientList.optional(),
  bcc: recipientList.optional(),
  subject: z.string().max(300).optional(),
  body: z.string().max(MAX_BODY_CHARS).optional(),
  replyToMessageId: z.string().uuid().nullable().optional(),
  fromAliasId: z.string().uuid().nullable().optional(),
  attachmentIds: z.array(z.string().uuid()).max(20).optional(),
});
export type DraftBody = z.infer<typeof draftBodySchema>;

export const draftSchema = z.object({
  id: z.string(),
  conversationId: z.string().nullable(),
  to: z.array(z.string()),
  cc: z.array(z.string()),
  bcc: z.array(z.string()),
  subject: z.string(),
  body: z.string(),
  replyToMessageId: z.string().nullable(),
  fromAliasId: z.string().nullable(),
  attachmentIds: z.array(z.string()),
  updatedAt: z.string(),
});
export type Draft = z.infer<typeof draftSchema>;

// ---- folders and threads (web client) -------------------------------------------------

export const personSchema = z.object({ name: z.string().nullable(), address: z.string() });
export type Person = z.infer<typeof personSchema>;

/** One row in a Gmail-style list: a thread, shown by its newest message. */
export const mailListItemSchema = z.object({
  threadId: z.string(),
  /** Every entry of this thread in this folder (for bulk actions) */
  entryIds: z.array(z.string()),
  messageId: z.string(),
  subject: z.string(),
  snippet: z.string(),
  from: personSchema,
  /** Shown as "Arjun, me" (the UI translates "me"); in Sent, the recipients. */
  participants: z.array(z.object({ name: z.string(), me: z.boolean() })),
  count: z.number(),
  isRead: z.boolean(),
  isStarred: z.boolean(),
  hasAttachments: z.boolean(),
  sentAt: z.string(),
});
export type MailListItem = z.infer<typeof mailListItemSchema>;

export const mailboxPageSchema = z.object({
  items: z.array(mailListItemSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type MailboxPage = z.infer<typeof mailboxPageSchema>;

export const threadMessageSchema = z.object({
  entryId: z.string(),
  messageId: z.string(),
  conversationId: z.string(),
  direction: z.enum(['incoming', 'outgoing']),
  from: personSchema,
  to: z.array(z.string()),
  cc: z.array(z.string()),
  /** Only on your own sent messages */
  bcc: z.array(z.string()),
  subject: z.string(),
  text: z.string(),
  html: z.string().nullable(),
  hasRemoteImages: z.boolean(),
  sentAt: z.string(),
  isRead: z.boolean(),
  isStarred: z.boolean(),
  isSpam: z.boolean(),
  trashed: z.boolean(),
  repliedAt: z.string().nullable(),
  replyMessageId: z.string().nullable(),
  deliveryState: z.string().nullable(),
  messageIdHeader: z.string(),
  attachments: z.array(attachmentSchema),
});
export type ThreadMessage = z.infer<typeof threadMessageSchema>;

export const threadSchema = z.object({
  threadId: z.string(),
  subject: z.string(),
  messages: z.array(threadMessageSchema),
});
export type Thread = z.infer<typeof threadSchema>;

// ---- actions on entries -------------------------------------------------------------------

export const entryIdsBodySchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });

export const patchEntriesBodySchema = entryIdsBodySchema.extend({
  isRead: z.boolean().optional(),
  isStarred: z.boolean().optional(),
});

export const spamEntriesBodySchema = entryIdsBodySchema.extend({
  blockSender: z.boolean().optional(),
});

// ---- search ----------------------------------------------------------------------------------

export const searchMessageHitSchema = z.object({
  entryId: z.string(),
  messageId: z.string(),
  conversationId: z.string(),
  threadId: z.string(),
  subject: z.string(),
  from: personSchema,
  /** The matching words wrapped in <mark>…</mark>; everything else is escaped text. */
  highlight: z.string(),
  sentAt: z.string(),
});
export type SearchMessageHit = z.infer<typeof searchMessageHitSchema>;

export const startChatSchema = z.object({
  address: z.string(),
  displayName: z.string().nullable(),
  /** +91 98765 43210, when the search text was a phone number */
  phoneDisplay: z.string().nullable(),
  isPhoneMailUser: z.boolean(),
});
export type StartChat = z.infer<typeof startChatSchema>;
