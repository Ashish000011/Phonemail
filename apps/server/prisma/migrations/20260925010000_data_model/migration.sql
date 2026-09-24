-- CreateEnum
CREATE TYPE "Language" AS ENUM ('en', 'hi', 'ta');

-- CreateEnum
CREATE TYPE "RegistrationChannel" AS ENUM ('ivr', 'sms', 'portal', 'web', 'mobile');

-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('mobile', 'web', 'apk');

-- CreateEnum
CREATE TYPE "ConversationKind" AS ENUM ('direct', 'group', 'self');

-- CreateEnum
CREATE TYPE "RecipientKind" AS ENUM ('to', 'cc', 'bcc');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('incoming', 'outgoing');

-- CreateEnum
CREATE TYPE "DeliveryState" AS ENUM ('sending', 'sent', 'delivered', 'read', 'failed');

-- CreateEnum
CREATE TYPE "SmsPurpose" AS ENUM ('otp', 'notification', 'signup_reply', 'ivr_confirmation', 'other');

-- CreateEnum
CREATE TYPE "SmsStatus" AS ENUM ('queued', 'sent', 'failed', 'simulated');

-- CreateEnum
CREATE TYPE "AuthEventType" AS ENUM ('otp_requested', 'otp_failed', 'otp_verified', 'login', 'logout', 'password_changed', 'session_revoked', 'account_created');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "localPart" TEXT NOT NULL,
    "displayName" TEXT,
    "about" TEXT,
    "avatarPath" TEXT,
    "language" "Language" NOT NULL DEFAULT 'en',
    "passwordHash" TEXT,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "registrationChannel" "RegistrationChannel" NOT NULL,
    "tosVersion" TEXT,
    "tosAcceptedAt" TIMESTAMP(3),
    "readReceipts" BOOLEAN NOT NULL DEFAULT true,
    "loadRemoteImages" BOOLEAN NOT NULL DEFAULT false,
    "defaultSendAsAliasId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alias" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "localPart" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Alias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "clientType" "ClientType" NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "previousTokenHash" TEXT,
    "userAgent" TEXT,
    "ip" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "kind" "ConversationKind" NOT NULL,
    "participantKeyHash" TEXT NOT NULL,
    "participantKeys" TEXT[],
    "title" TEXT,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageId" UUID,
    "chatDraftSubject" TEXT,
    "chatDraftBody" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationParticipant" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "identityKey" TEXT NOT NULL,
    "userId" UUID,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "messageIdHeader" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "inReplyToHeader" TEXT,
    "referencesHeader" TEXT,
    "parentMessageId" UUID,
    "fromAddress" TEXT NOT NULL,
    "fromUserId" UUID,
    "fromName" TEXT,
    "subject" TEXT NOT NULL,
    "textBody" TEXT NOT NULL,
    "htmlSanitized" TEXT,
    "snippet" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "rawPath" TEXT NOT NULL,
    "hasAttachments" BOOLEAN NOT NULL DEFAULT false,
    "hasRemoteImages" BOOLEAN NOT NULL DEFAULT false,
    "spamScore" INTEGER NOT NULL DEFAULT 0,
    "plusTag" TEXT,
    -- Full-text search, computed by Postgres whenever a row is written.
    -- "simple" = no English stemming, so Hindi and Tamil words match too.
    "searchVector" tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('simple'::regconfig, coalesce("subject", '')), 'A') ||
        setweight(to_tsvector('simple'::regconfig, coalesce("fromName", '') || ' ' || coalesce("fromAddress", '')), 'B') ||
        setweight(to_tsvector('simple'::regconfig, left(coalesce("textBody", ''), 200000)), 'C')
    ) STORED,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageRecipient" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "kind" "RecipientKind" NOT NULL,
    "address" TEXT NOT NULL,
    "userId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailboxEntry" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "direction" "Direction" NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isStarred" BOOLEAN NOT NULL DEFAULT false,
    "isSpam" BOOLEAN NOT NULL DEFAULT false,
    "trashedAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "replyMessageId" UUID,
    "deliveryState" "DeliveryState",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailboxEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" UUID NOT NULL,
    "messageId" UUID,
    "uploaderId" UUID,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "contentId" TEXT,
    "isInline" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Draft" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "conversationId" UUID,
    "to" TEXT[],
    "cc" TEXT[],
    "bcc" TEXT[],
    "subject" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "replyToMessageId" UUID,
    "fromAliasId" UUID,
    "attachmentIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockedSender" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "identityKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlockedSender_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsLog" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "toE164" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "purpose" "SmsPurpose" NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "SmsStatus" NOT NULL,
    "providerMessageId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthEvent" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "phoneE164" TEXT,
    "type" "AuthEventType" NOT NULL,
    "channel" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneE164_key" ON "User"("phoneE164");

-- CreateIndex
CREATE UNIQUE INDEX "User_localPart_key" ON "User"("localPart");

-- CreateIndex
CREATE UNIQUE INDEX "Alias_localPart_key" ON "Alias"("localPart");

-- CreateIndex
CREATE INDEX "Alias_userId_idx" ON "Alias"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshTokenHash_key" ON "Session"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_clientType_idx" ON "Session"("userId", "clientType");

-- CreateIndex
CREATE INDEX "Session_previousTokenHash_idx" ON "Session"("previousTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_userId_phoneE164_key" ON "Contact"("userId", "phoneE164");

-- CreateIndex
CREATE INDEX "Conversation_ownerId_lastMessageAt_idx" ON "Conversation"("ownerId", "lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "Conversation_ownerId_isFavorite_idx" ON "Conversation"("ownerId", "isFavorite");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_ownerId_participantKeyHash_key" ON "Conversation"("ownerId", "participantKeyHash");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationParticipant_conversationId_identityKey_key" ON "ConversationParticipant"("conversationId", "identityKey");

-- CreateIndex
CREATE UNIQUE INDEX "Message_messageIdHeader_key" ON "Message"("messageIdHeader");

-- CreateIndex
CREATE INDEX "Message_threadId_idx" ON "Message"("threadId");

-- CreateIndex
CREATE INDEX "Message_searchVector_idx" ON "Message" USING GIN ("searchVector");

-- CreateIndex
CREATE INDEX "MessageRecipient_messageId_idx" ON "MessageRecipient"("messageId");

-- CreateIndex
CREATE INDEX "MessageRecipient_userId_idx" ON "MessageRecipient"("userId");

-- CreateIndex
CREATE INDEX "MailboxEntry_userId_conversationId_createdAt_idx" ON "MailboxEntry"("userId", "conversationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "MailboxEntry_userId_direction_isSpam_trashedAt_idx" ON "MailboxEntry"("userId", "direction", "isSpam", "trashedAt");

-- CreateIndex
CREATE INDEX "MailboxEntry_conversationId_idx" ON "MailboxEntry"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "MailboxEntry_userId_messageId_direction_key" ON "MailboxEntry"("userId", "messageId", "direction");

-- CreateIndex
CREATE INDEX "Attachment_messageId_idx" ON "Attachment"("messageId");

-- CreateIndex
CREATE INDEX "Attachment_uploaderId_messageId_idx" ON "Attachment"("uploaderId", "messageId");

-- CreateIndex
CREATE INDEX "Draft_userId_updatedAt_idx" ON "Draft"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "BlockedSender_userId_identityKey_key" ON "BlockedSender"("userId", "identityKey");

-- CreateIndex
CREATE INDEX "SmsLog_createdAt_idx" ON "SmsLog"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "SmsLog_userId_createdAt_idx" ON "SmsLog"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuthEvent_userId_createdAt_idx" ON "AuthEvent"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuthEvent_createdAt_idx" ON "AuthEvent"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "Alias" ADD CONSTRAINT "Alias_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_parentMessageId_fkey" FOREIGN KEY ("parentMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageRecipient" ADD CONSTRAINT "MessageRecipient_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageRecipient" ADD CONSTRAINT "MessageRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailboxEntry" ADD CONSTRAINT "MailboxEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailboxEntry" ADD CONSTRAINT "MailboxEntry_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailboxEntry" ADD CONSTRAINT "MailboxEntry_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockedSender" ADD CONSTRAINT "BlockedSender_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsLog" ADD CONSTRAINT "SmsLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthEvent" ADD CONSTRAINT "AuthEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Unread incoming mail per user (chat badges, Inbox count). A partial index
-- only holds incoming rows, so it stays small. Not expressible in schema.prisma.
CREATE INDEX "MailboxEntry_unread_incoming_idx" ON "MailboxEntry" ("userId", "isRead") WHERE "direction" = 'incoming';
