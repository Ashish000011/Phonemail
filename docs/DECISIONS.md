# Design decisions and assumptions

Where the task document is silent or ambiguous, this is what PhoneMail does and
why. The AI assistant adds to this list during the build; the README links here.

1. "On creation, the fields must rest" is read as "reset": the portal clears
   both fields after each account so the next person can register.
2. Address format: Indian numbers use the 10-digit number
   (9876543210@phonemail.com, as in the task). Other countries use
   00 + country code + number (0014155550123@phonemail.com), so the two
   formats can't collide.
3. "Users who do not have the mobile application" is decided by whether the
   user has an active mobile session right now, not only by how they signed
   up. Signing in on mobile stops SMS alerts; signing out of every mobile
   session starts them again.
4. Chats are keyed by the set of other people in the email. All addresses of
   one PhoneMail user (primary, aliases, plus addresses) count as one person,
   so "all emails from the same sender stay within the same chat" even when
   they switch aliases.
5. Sending to 2+ people from Home creates the group chat for exactly that set
   and reuses it for the same set later. A new email to one of them goes to
   the 1:1 chat.
6. The set of people decides the chat even for replies. A reply from an
   outside mail app that drops people lands in the chat for the people it was
   actually sent to, still showing the quoted original.
7. Someone who only received an email as Bcc sees it in their 1:1 chat with
   the sender.
8. "Each message can be replied to only once" applies per user per message,
   to incoming and own messages, and the server enforces it.
9. Replies get "Re: <original subject>"; the subject field is hidden while
   replying, in chat view and in the traditional composer.
10. Empty subjects are allowed and shown as "(no subject)".
11. OTP delivery picks the best available path automatically: custom-text SMS
    → Twilio Verify → demo console → password mode. Twilio's trial only allows
    template SMS text, so our own codes can't travel through Twilio SMS.
12. Twilio trial SMS (alerts, confirmations) uses a Twilio template, as the
    organizers allowed. SMSGate, when configured, sends the task's exact text.
13. Per the organizers' clarification, the mobile client is a responsive web
    app at /m, with an optional Capacitor APK. True SIM number detection is
    only possible in the APK; on the web the number comes from browser
    autofill or the ?phone= link in the welcome SMS, and stays editable.
14. "The space occupied by WhatsApp's camera tab" is read as the camera button
    in WhatsApp's chat input bar; PhoneMail puts "Write in full view" there.
15. Deleted aliases are held for 30 days before anyone else can claim them,
    so mail meant for the old owner can't be captured.
16. External recipients go through a configurable SMTP relay; in demo mode
    that's Mailpit, so judges can see outgoing external mail safely.
