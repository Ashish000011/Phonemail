# 07: Mobile client (WhatsApp design language)

Route prefix `/m`. Built for 360–430px wide screens. It must also look right in
a desktop browser's device emulator, because judges may test it that way.

## Design direction
Follow the current WhatsApp Android app's structure and behavior closely: top
bars, full-width search, filter chips, chat rows, bubbles with tails, ticks,
swipe-to-reply, the input bar, bottom sheets, the onboarding flow. Judges score
"adherence to design language", so a WhatsApp user should feel at home instantly.

PhoneMail keeps its own identity (never use WhatsApp's logo or name):
- Logo: a speech bubble whose top edge folds like an envelope flap, in the
  brand color. One SVG that works at 24px.
- The one memorable thing: the chat wallpaper. WhatsApp's doodle idea redrawn
  with mail motifs (envelopes, stamps, @ signs, paper planes, postmarks) as a
  subtle repeating SVG at low contrast.
- Everything else stays quiet and native: no gradients, no generic card grids,
  no all-caps labels, sentence case everywhere. Buttons say what they do
  ("Agree and continue", "Send code", "Create address").

## Tokens (light)
| Token | Value | Use |
|---|---|---|
| brand | #008069 | primary buttons, FAB, links, selected chips, title text |
| brand-bright | #25D366 | small accents with dark foreground only |
| surface | #FFFFFF | lists, sheets, top bars |
| app-bg | #F0F2F5 | settings background, behind sheets |
| chat-bg | #EFEAE2 | chat wallpaper base |
| bubble-out | #D9FDD3 | my messages |
| bubble-in | #FFFFFF | their messages |
| text | #111B21 | primary text |
| text-muted | #667781 | previews, timestamps |
| tick-read | #53BDEB | blue ticks |
| danger | #D93025 | destructive actions |
Dark theme (stretch): bg #0B141A, bars #202C33, bubble-out #005C4B, bubble-in
#202C33, text #E9EDEF, muted #8696A0.
Contrast: text needs 4.5:1. White on #25D366 fails, so never put white text or
icons on brand-bright; unread badges use brand with white text.

Type: `Roboto, "Segoe UI", system-ui, sans-serif`, plus self-hosted
Noto Sans Devanagari and Noto Sans Tamil subsets for Hindi and Tamil. Sizes in
rem: 1rem body, 1.0625rem chat names, 0.875rem previews, 0.75rem timestamps,
1.25–1.375rem titles. 4px spacing grid, 72px chat rows, touch targets ≥ 44px,
`100dvh` screens, safe-area insets respected.
Motion: native-like slide between screens (150–200ms); bubbles follow the
finger on swipe and spring back; the reply icon fades in past the threshold.
prefers-reduced-motion turns these off.

## Onboarding
Screen 1: Language
- Logo, "Welcome to PhoneMail", "Choose your language".
- Radio list with native names and muted English names: English; हिन्दी
  (Hindi); தமிழ் (Tamil). Choosing one switches the UI immediately.
- Full-width "Next" button at the bottom.

Screen 2: Terms
- Simple SVG illustration (phone + envelope), "Welcome to PhoneMail".
- "Read our Privacy Policy. Tap "Agree and continue" to accept the Terms of
  Service." Both are links that open in a bottom sheet.
- "Agree and continue". The accepted tosVersion is kept locally until the
  account exists, then saved on it.

Screen 3: Phone number
- Title "Enter your phone number"; text "PhoneMail will need to verify your
  phone number. Carrier charges may apply." and a "What's my number?" link
  (sheet explaining how to find it).
- Country row (default India +91; searchable sheet) and the number input:
  `type="tel" inputmode="tel" autocomplete="tel-national"`.
- Pre-fill, first match wins: `?phone=` from the welcome SMS link; the APK's
  Phone Number Hint; the browser's saved number (the field autofocuses so
  Chrome offers it). The field always stays editable.
- Before the first detection attempt, a WhatsApp-style sheet: "Let PhoneMail
  find your number? It makes signing up faster. You can still type it."
  [Not now] [Continue].
- "Next" → dialog "You entered the phone number: +91 98765 43210. Is this OK,
  or would you like to edit the number?" [Edit] [OK].
- OK → request the code → Screen 4. Inline errors: invalid number, rate
  limited (with countdown).

Screen 4: Verify
- Title "Verifying your number"; text "Waiting to automatically detect an SMS
  sent to +91 98765 43210." with a "Wrong number?" link back to screen 3.
- Six code boxes backed by one real input:
  `autocomplete="one-time-code" inputmode="numeric" maxlength="6"`.
  Auto-submits on the sixth digit.
- Automatic detection: WebOTP
  (`navigator.credentials.get({ otp: { transport: ['sms'] }, signal })`) where
  supported (Chrome on Android, HTTPS); the one-time-code autofill covers
  Safari on iPhone; the APK reads it natively. Abort WebOTP on unmount.
- "Didn't receive the code?" with "Resend SMS" after a 30s countdown.
- Demo mode: a slim banner "Demo mode · code 123456" with a copy button, only
  when the API returned demoCode.
- Success → short "Verified" check animation → contacts sheet → Home.
- Password mode: screens 3–4 become phone + password on one screen.

Permissions, asked in context and never all at once:
- Phone number: the sheet on screen 3.
- SMS/OTP reading: automatic in the browser; in the APK the SMS User Consent
  prompt appears on screen 4.
- Contacts: after verification, "To show names instead of numbers, allow
  PhoneMail to use your contacts" [Not now] [Continue]. Web: the Contact
  Picker API where supported (Chrome on Android) to pick contacts to share;
  otherwise skip silently. APK: the contacts permission, then match numbers.
- Notifications: the first time an email arrives while the app is open, an
  inline card "Get notified about new emails" [Turn on]. Realtime in-app
  delivery is the baseline; web push is a stretch.
"Not now" answers are remembered and offered again from Settings.

## Home
Top to bottom:
- Top bar: menu button (left), "PhoneMail" in brand color, profile avatar
  button (right, opens Settings).
- Full-width rounded search field: "Search or start a new chat".
- Filter chips: All, Unread, Attachments, Favorites. Horizontal scroll, the
  selected chip tinted brand, instant filtering.
- Chat rows: 48px avatar; name (bold when unread); time on the right (brand
  color when unread); preview line with ticks for my last message, then
  "Subject · snippet" for new emails or the snippet for replies, a paperclip
  when it has attachments, or "Draft: …" in brand color when a chat draft
  exists; unread badge; star when favorite.
- Compose button bottom-right: 56px rounded square, brand background, white
  pencil icon, aria-label "Write email". Opens the traditional composer.
- Empty state: small illustration, "Start a conversation", "Search a phone
  number above, or tap the pencil to write an email."

Search:
- Results in sections: Chats (name and number matches), Messages (hits with
  matched words highlighted) and, when the text is a valid number or email,
  "Start a chat with +91 98765 43210", which opens the direct chat through
  `conversations/resolve`.

Long-press a chat → selection mode: the top bar shows the count and actions
(Favorite, Mark read/unread, Move to trash, Report spam). Tap to add more;
Back or ✕ exits.

Menu (left drawer):
- Header: avatar, name, primary address with a copy button.
- Home (Inbox and Sent together), Drafts (count), Spam, Trash.
- Footer: "Switch to desktop view", version.
Drafts, Spam and Trash are plain email lists with the same row style. Tapping
opens the composer (Drafts) or the traditional reader (Spam, Trash). Trash has
"Empty trash"; Spam has "Not spam".

## Chat screen
Top bar: back, avatar, title (tap → chat info), subtitle: the address for
direct chats ("9876543210@phonemail.com") or participant names for groups;
overflow menu: Chat info, Add to favorites, Search in chat, Report spam, Move
chat to trash.

Messages:
- Mail-doodle wallpaper, sticky date separators (Today, Yesterday, 12
  September 2026), an unread divider ("3 unread emails") when opening.
- Bubbles: mine on the right (bubble-out), theirs on the left (bubble-in);
  tail on the first bubble of a run; max width 80%.
- Group chats: the sender's name, colored per person, on their bubbles.
- New email bubble: bold subject line with a small envelope glyph, then the
  text (clamped at 12 lines), attachments, and a footer with time, star and
  ticks.
- Reply bubble: quoted parent block (left border in the parent sender's color,
  their name, parent subject or first line; tap scrolls to the parent and
  flashes it), then the text.
- Long emails: clamped with "Read more" → traditional reader. Tapping any
  bubble also opens it in the traditional reader.
- Attachments: images as thumbnails (tap opens a viewer), other files as chips
  with name, size and type icon (tap downloads).
- Replied messages: a small "↩ Replied" link under the bubble.
- A scroll-to-bottom button with the unread count when scrolled up; older
  messages load as you scroll up.

Swipe right to reply:
- Drag right; past ~64px the reply icon appears and a light haptic fires
  (navigator.vibrate where available); release to set the reply target.
- Disabled on messages already replied to: the bubble resists and a toast says
  "You've already replied to this email".
Long-press a bubble → action sheet: Reply, Reply in full view, Open in full
view, Star/Unstar, Copy text, Info (from, to, cc, date, message id), Move to
trash. This is also the accessible route to everything swipe does.

Input area (bottom):
- Subject pill: compact single line above the message box ("Subject"); shown
  for new emails, hidden while replying.
- Reply bar while replying: the quoted target, ✕ to cancel, and "Open in full
  view" to continue the reply in the traditional composer.
- Message row: emoji button, auto-growing "Message" box, attach button, the
  full-view button where WhatsApp has its camera button (envelope with an
  expand arrow; aria-label "Write in full view"), and a round send button when
  there's text.
- Sending shows the bubble at once with a clock; ticks update live.

Chat info: large avatar, name, addresses, phone number, "Media and files" grid,
starred emails, participants (groups), and actions: Add to favorites, Report
spam, Block, Move chat to trash.

## Traditional reader
Full screen. Top bar: back, star, move to trash, overflow (Report spam, Info).
Large subject; sender row (avatar, name, address, date; "to me, cc …" expands
to full headers); body (sanitized HTML in the sandboxed iframe, or plain
text); a "Show images" banner when remote images were blocked; attachments.
Bottom bar: a "Reply" button, or "Replied" (opens the reply) when the user
already replied.

## Traditional composer
Full screen. Top bar: ✕ (asks "Save draft?" when there's content), attach,
send. Fields: From (primary address and aliases), To and Cc as chips with
contact suggestions (phone numbers or emails; invalid chips in red), Bcc behind
"Cc/Bcc", Subject, auto-growing plain-text Body, attachment list.
- Opened from Home: everything editable; 2+ recipients sends into the group chat.
- Opened from inside a chat: To/Cc pre-filled and locked (lock icon + hint).
- As a reply: recipients locked, subject hidden, the quoted original shown
  read-only under the body.
- Drafts autosave every few seconds.

## Settings (profile icon)
- Profile: photo (upload, square crop), name, about, phone number and primary
  address (copy).
- Aliases: list with a default "send as" radio; add with a live availability
  check that explains why a name is unavailable; delete with a note about the
  30-day hold.
- Language: English, हिन्दी, தமிழ் (switches instantly).
- Notifications: one sentence explaining the SMS rule ("You get SMS alerts only
  when you're not signed in on the mobile app"); in-app sound toggle; the
  contacts and notification permission prompts again.
- Privacy: read receipts, load remote images, blocked senders.
- Devices: active sessions with type and last active; "Log out of all other
  devices".
- Help: Terms, Privacy, About (version, GitHub link). Theme (stretch).
- Log out.

## States
Skeleton rows while loading; an offline banner "Waiting for network…" when
the socket is down; inline errors that say what to do next; empty states that
invite an action.

## APK (stretch, Phase 10)
Wrap the built SPA with Capacitor (Android):
- Phone Number Hint API (Google Play services) on screen 3.
- SMS User Consent API for the code on screen 4.
- Contacts permission and number matching.
- Sessions with clientType `apk`.
Build a debug APK on GitHub Actions (Ubuntu runner with the Android SDK) and
attach it to a release, so no local Android Studio is needed. The APK talks to
PUBLIC_BASE_URL.
