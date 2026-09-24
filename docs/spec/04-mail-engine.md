# 04: Mail engine

## SMTP server (smtp service)
Built with `smtp-server`, listening on 2525.
- Greeting and EHLO name: MAIL_DOMAIN.
- AUTH PLAIN is accepted only with a short-lived internal token the api issues
  for one user (HMAC of userId + expiry with INTERNAL_SMTP_SECRET).
  Authenticated sessions may send to any address; MAIL FROM must be one of that
  user's addresses.
- Unauthenticated sessions (other mail servers, swaks, the demo console) may
  only deliver to local addresses. RCPT to another domain →
  `550 5.7.1 Relaying denied`; unknown local address → `550 5.1.1 No such user`.
  This is what "not an open relay" means; say so in the README.
- Limits: 25 MB per message, 50 recipients, 10 concurrent connections per IP,
  a per-IP rate limit.
- On DATA: stream to a temp file, parse with `mailparser`, run the ingest
  pipeline, and reply 250 only after its transaction commits.

## Ingest pipeline (one module, used by every path)
1. Save the raw message to `/data/mail/YYYY/MM/<uuid>.eml`.
2. Parse headers, text, HTML and attachments. If there's only HTML, derive the
   text with html-to-text. Build the snippet.
3. Sanitize the HTML (below) and detect remote images.
4. Resolve Message-ID (generate `<uuid@MAIL_DOMAIN>` if missing), In-Reply-To
   and References. threadId = root of the References chain, else the parent's
   threadId, else the message's own id. Resolve parentMessageId.
5. Resolve recipients to local users (primary, alias or plus address).
6. Store Message, MessageRecipients and Attachments.
7. If the sender is local: an outgoing MailboxEntry. For every local
   recipient: an incoming MailboxEntry with the spam check applied.
8. Put each entry into its owner's conversation (keying rule in 05).
9. If it's a reply from a local user, set `repliedAt` and `replyMessageId` on
   that user's entry for the parent.
10. After commit: publish `mail.delivered` per local user on Redis, enqueue
    notification jobs and relay jobs for external recipients.
Idempotent: a known Message-ID doesn't create a second Message; only missing
mailbox entries are added.

## Sending (api)
`POST /api/messages`
```
{ conversationId?: string,          // when sending from inside a chat
  to?: string[], cc?: string[], bcc?: string[],   // only without conversationId
  subject?: string,                 // ignored for replies
  body: string,                     // plain text, max 100 KB
  replyToMessageId?: string,
  fromAliasId?: string,             // default: the user's default send-as
  attachmentIds?: string[],         // uploaded first via /api/attachments
  draftId?: string }                // deleted after a successful send
```
Rules (422 with a clear code when broken):
- With conversationId: recipients are the conversation's participants. Any
  to/cc/bcc in the request → RECIPIENTS_LOCKED.
- Without conversationId: at least one recipient. Each may be a phone number
  (normalized to its address), a PhoneMail alias, or any valid email.
- Replies: replyToMessageId must be visible to the user and not replied to by
  them yet → otherwise ALREADY_REPLIED. Subject becomes `Re: <parent subject>`
  without stacking ("Re: Re: hi" → "Re: hi"). In-Reply-To and References come
  from the parent.
- New emails: subject optional; empty is stored as "" and shown as
  "(no subject)".
Then build the MIME message with nodemailer (plain text body), submit it over
SMTP with the user's token, and return `{ messageId, conversationId }`.
Outgoing deliveryState: `sent` once the SMTP server accepts, `delivered` when
every local recipient has an entry, `read` when every local recipient has read
it (only if both sides allow read receipts).

Attachments: `POST /api/attachments` (multipart, max 20 MB per file and 25 MB
per email) → an id; unsent uploads are purged after 24 hours.
`GET /api/attachments/:id` checks the user can see the message, then sends it
with the sniffed content type, `X-Content-Type-Options: nosniff`, and
`Content-Disposition: attachment` (inline only for images).

## Outbound to external domains (worker)
Relay through SMTP_RELAY_* (Mailpit by default, so judges see external mail at
http://localhost:8025). Retry with backoff; after the final failure, deliver a
notice from `mailer-daemon@` into the sender's chat: "Couldn't deliver to
x@y.com".

## HTML safety
- sanitize-html: allow basic formatting, lists, tables, links and images;
  strip scripts, styles containing url(), event handlers, forms, iframes,
  objects, meta refresh, `javascript:` URLs and `data:` URLs other than
  images. Links get `target="_blank" rel="noopener noreferrer"`.
- HTML is rendered only in the traditional reader, inside
  `<iframe sandbox="allow-popups allow-popups-to-escape-sandbox" srcdoc=…>`
  with a CSP meta tag that blocks scripts.
- Remote images stay blocked until the user taps "Show images" (or turns on
  loadRemoteImages). This also blocks tracking pixels.
- The chat view shows only the text version.

## Folders and flags
Web (Gmail) folders:
- Inbox: incoming, not spam, not trashed. Sent: outgoing, not trashed.
- Starred: isStarred, not trashed. Spam: isSpam, not trashed.
- Trash: trashedAt set. Drafts: the Draft table.
Mobile: Home is every non-spam, non-trashed entry grouped by conversation; the
menu has Drafts, Spam and Trash.
Endpoints:
- `GET /api/mailbox/:folder?cursor=` (web list, 50 per page, grouped by thread)
- `GET /api/threads/:threadId` (web reading view)
- `PATCH /api/entries` { ids, isRead?, isStarred? }
- `POST /api/entries/trash` { ids }, `/restore`, `/delete-forever` (Trash only)
- `POST /api/entries/spam` { ids, blockSender? }, `/not-spam`
- `POST /api/trash/empty`
- Drafts: `GET/POST/PATCH/DELETE /api/drafts` (composers autosave)
Trash is purged after 30 days (daily worker job). Deleting removes only that
user's entry; a Message row goes away when no entries point to it.

## Spam (simple and explainable)
- A sender in BlockedSender → spam.
- Score: +3 external sender with no prior conversation, +2 more than five
  links, +2 subject in all caps, +3 phrase from a small spam-phrase list,
  -5 sender is a contact or has an existing conversation. Score ≥ 5 → spam.
- "Report spam" blocks the sender and moves their mail to Spam. "Not spam"
  unblocks and moves it back.

## Search
Postgres full-text search on searchVector plus address matching.
`GET /api/search?q=`:
- Mobile shape: { conversations (name/number matches), messages (hits with
  highlighted snippets), startChat? }.
- Web shape: the Gmail list format.
If `q` parses as a phone number or is a valid email, include
`startChat: { address, displayName? }` so the UI can offer "Start a chat with
+91 98765 43210".
