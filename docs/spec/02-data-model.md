# 02: Data model and addressing

## Phone numbers → addresses
- Parse input with libphonenumber-js using DEFAULT_COUNTRY (IN). Accept
  "98765 43210", "+91 98765-43210", "09876543210". Reject invalid numbers and
  non-mobile numbers with a clear error code (INVALID_PHONE).
- Store `phoneE164` on the user (e.g. `+919876543210`).
- Primary local part:
  - India (+91): the 10-digit national number → `9876543210`.
  - Any other country: `00` + country code + national number →
    `0014155550123`. Indian national mobile numbers never start with 0, so the
    two formats can't collide.
- Primary address: `<localPart>@<MAIL_DOMAIN>`.
- Display format: `+91 98765 43210` (international format).

## Aliases
- After lowercasing, must match `^[a-z][a-z0-9._-]{2,29}$`, must not be all
  digits, must not start with `00`, no consecutive dots, no trailing dot.
- Reserved: admin, administrator, postmaster, abuse, hostmaster, webmaster,
  root, support, help, info, noreply, no-reply, security, billing, welcome,
  system, team, mailer-daemon, and anything starting with `phonemail`.
- Unique across all users (case-insensitive) and never equal to a primary
  local part. Max 5 per user.
- One address per user is the default "send as" address (primary by default).
- A deleted alias is held for 30 days before anyone else can claim it, so mail
  meant for the old owner can't be captured.
- Plus addressing: `9876543210+news@…` and `alias+news@…` deliver to the owner;
  the tag is stored on the message for display and search.

## System identity
`welcome@<MAIL_DOMAIN>` (and later `mailer-daemon@`) are system senders that
belong to no user. They send the welcome email and delivery-failure notices.

## Identity keys
- PhoneMail user (via primary, alias or plus address): `u:<userId>`.
- Anyone else: `e:<lowercased address>`.
- A conversation's participant key is the sorted list of the other
  participants' identity keys joined with `|`; store the list and its SHA-256.

## Models
Write these as Prisma models. Add `createdAt` and `updatedAt` everywhere.

User
- id (uuid), phoneE164 (unique), localPart (unique), displayName?, about?,
  avatarPath?, language (en|hi|ta, default en), passwordHash?,
  mustChangePassword (bool), registrationChannel (ivr|sms|portal|web|mobile),
  tosVersion?, tosAcceptedAt?, readReceipts (default true),
  loadRemoteImages (default false), defaultSendAsAliasId? (null = primary)

Alias
- id, userId, localPart (unique), deletedAt? (30-day hold)

Session
- id, userId, clientType (mobile|web|apk), refreshTokenHash, previousTokenHash?
  (for reuse detection), userAgent, ip, lastSeenAt, expiresAt, revokedAt?

Contact (only contacts the user chose to share from the mobile client)
- id, userId, name, phoneE164; unique (userId, phoneE164)

Conversation (one per owner per participant set)
- id, ownerId, kind (direct|group|self), participantKeyHash,
  participantKeys (string[]), title? (owner's custom group name), isFavorite,
  lastMessageAt, lastMessageId?, chatDraftSubject?, chatDraftBody?
- unique (ownerId, participantKeyHash); index (ownerId, lastMessageAt desc)
- Unread count is computed (count of unread incoming entries), not stored.

ConversationParticipant
- conversationId, identityKey, userId?, address (display address)

Message (one row per email, shared by all local participants)
- id, messageIdHeader (unique), threadId, inReplyToHeader?, referencesHeader?,
  parentMessageId? (resolved In-Reply-To), fromAddress, fromUserId?,
  fromName?, subject, textBody, htmlSanitized?, snippet (first ~140 chars of
  text), sentAt, sizeBytes, rawPath, hasAttachments, hasRemoteImages,
  spamScore, plusTag?, searchVector (tsvector over subject, textBody,
  fromAddress, fromName; generated column or trigger via raw SQL migration)

MessageRecipient
- messageId, kind (to|cc|bcc), address, userId?

MailboxEntry (one user's copy of one message)
- id, userId, messageId, conversationId, direction (incoming|outgoing),
  isRead, isStarred, isSpam, trashedAt?, repliedAt?, replyMessageId?,
  deliveryState (sending|sent|delivered|read|failed; outgoing only)
- unique (userId, messageId, direction). An email to yourself creates two
  entries (outgoing and incoming).

Attachment
- id, messageId? (null until sent), uploaderId, filename (sanitized),
  contentType (sniffed), sizeBytes, storagePath, sha256, contentId?, isInline

Draft
- id, userId, conversationId?, to[], cc[], bcc[], subject, body,
  replyToMessageId?, fromAliasId?, attachmentIds[]

BlockedSender
- userId, identityKey; unique pair. Mail from a blocked identity goes to Spam.

SmsLog
- id, userId?, toE164, body, purpose (otp|notification|signup_reply|
  ivr_confirmation|other), provider, status (queued|sent|failed|simulated),
  providerMessageId?, error?

AuthEvent (audit trail)
- id, userId?, phoneE164?, type (otp_requested|otp_failed|otp_verified|
  login|logout|password_changed|session_revoked|account_created), channel,
  ip?, userAgent?

OTP challenges live in Redis, not Postgres (see 03).

## Indexes
- MailboxEntry (userId, conversationId, createdAt desc)
- MailboxEntry (userId, direction, isSpam, trashedAt) for Gmail folders
- MailboxEntry (userId, isRead) partial where direction = incoming
- Message (threadId); GIN on Message.searchVector
- Conversation (ownerId, isFavorite)
