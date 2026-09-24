# 05: Conversations (chats)

## Keying rule
For user U and message M:
1. If U appears only in Bcc (not From, To or Cc): others = { sender }.
2. Otherwise: others = identities of From ∪ To ∪ Cc, minus U's own identity.
   Bcc never counts.
3. No others → U's "self" chat (shown as "You", like messaging yourself).
4. One other → U's direct chat with that identity.
5. Two or more → U's group chat for exactly that set.
6. Find or create by (ownerId, participantKeyHash).
The participant set wins even for replies. If an outside mail app replies only
to the sender of a group email, that reply lands in the 1:1 chat; its quoted
parent still shows, labelled "in <group name>".

Examples (U = 9000000001, A = 9000000002, B = 9000000003, X = x@gmail.com):
| Email | U's chat |
|---|---|
| A → U | direct(A) |
| U → A | direct(A) |
| U → A, where A sends from alias `arjun@` | direct(A) (aliases collapse) |
| A (from `9000000002+work@`) → U | direct(A) (plus addresses collapse) |
| U → A, B from Home compose | group(A, B) |
| U → B, A (same people, other order) | the same group(A, B) |
| A → U, B | group(A, B) |
| B → U, cc A | group(A, B) |
| U → A as a new email after the group exists | direct(A), not the group |
| X → U | direct(X) |
| U → U | self |
| A → U, bcc B: for B | direct(A) |
Every row is a unit test.

## Titles and avatars
- Direct: the user's contact name for that number, else the PhoneMail user's
  displayName, else the formatted number (+91 98765 43210), else the address.
- Group: short names joined with commas ("Arjun, Meera"); the owner can rename
  it for themselves (Conversation.title).
- Avatars: profile photo, else a colored circle with initials (color derived
  from the identity key); groups get a people icon.

## Replies
- Swipe right (or the Reply action) sets the reply target.
- A user can reply to a given message only once, whether it's incoming or
  their own. The server rejects a second reply with ALREADY_REPLIED. The UI
  disables swipe on replied messages and shows a "Replied" link that jumps to
  the reply.
- Replies carry In-Reply-To, References and a `Re:` subject. Reply bubbles
  show the quoted parent (sender + subject or first line) instead of a subject.
- New emails show their subject as the first line of the bubble, in bold.

## Subject field in chat
- Visible above the message box for new emails: a compact single line,
  placeholder "Subject".
- Hidden while a reply target is set; returns when the reply is cancelled or
  sent.

## Locked recipients
- Inside a chat, recipients are the chat's participants. They can't be
  changed in chat view or traditional view; locked fields show a lock icon and
  the hint "To add people, start a new email from Home".
- A new email in a group chat goes To every participant.
- Only the Home composer takes multiple recipients; 2+ recipients create (or
  reuse) the group chat for that exact set.

## API (mobile)
- `GET /api/conversations?filter=all|unread|attachments|favorites&cursor=`
  → items { id, kind, title, avatar, participants, lastMessage { snippet,
  subject, isReply, fromMe, deliveryState, hasAttachments, sentAt },
  unreadCount, isFavorite, chatDraft? }, newest first, 30 per page.
  - unread: unreadCount > 0; attachments: any non-trashed message with
    attachments; favorites: isFavorite.
- `POST /api/conversations/resolve` { phoneOrAddress } → finds or creates the
  direct chat (used by "search a number to start a chat").
- `GET /api/conversations/:id` → header info and participants.
- `GET /api/conversations/:id/messages?before=&limit=40` → oldest to newest
  within the page, cursor pagination backwards. Item { entryId, messageId,
  direction, from { name, address, color }, subject, text, isLong (over 700
  characters or 12 lines), attachments, sentAt, deliveryState, isStarred,
  repliedAt, replyMessageId, parent? { messageId, fromName, subject, snippet,
  conversationId, conversationTitle } }.
- `POST /api/conversations/:id/read` marks incoming entries read and emits
  receipts.
- `PATCH /api/conversations/:id` { isFavorite?, title?, chatDraftSubject?, chatDraftBody? }
- `POST /api/conversations/:id/trash`, `/spam` (the whole chat)
- Sending: `POST /api/messages` with conversationId (see 04).

## Delivery states and ticks
- Outgoing bubble: clock (sending) → one grey tick (sent: SMTP accepted) →
  two grey ticks (delivered to every local recipient's mailbox) → two blue
  ticks (read by every local recipient, if both allow read receipts).
- External recipients: one tick means handed to the relay.

## Realtime (Socket.IO)
- Auth with the access cookie on the handshake; each socket joins `user:<id>`.
- api subscribes to the Redis `events` channel and forwards to rooms.
- Events (payloads reuse the REST item shapes; names live in packages/shared):
  - `message:new` { conversation (list item), message (chat item) }
  - `message:updated` { entryId, changes } (star, read, delivery state)
  - `conversation:updated` { conversation }
  - `conversation:removed` { id } (trashed or marked spam)
- Clients update TanStack Query caches from events and refetch visible lists
  on reconnect.
- New emails are announced through an aria-live region.

## Chat drafts
Subject and text typed in a chat are saved on the conversation (debounced 1
second). The chat list shows "Draft: …" in the accent color, like WhatsApp.

## Required unit tests
The whole example table, plus: reply-once enforcement (second reply → 422),
subject normalization, RECIPIENTS_LOCKED with conversationId, group reuse with
a different recipient order, title fallbacks.
