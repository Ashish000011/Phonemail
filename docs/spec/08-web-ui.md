# 08: Web client, web login, registration portal

The web client shares the brand color and logo with mobile but follows Gmail's
layout and behavior, so it reads as "Gmail-like" at a glance.

## Web login (`/login`)
One centered card; only the logo and footer links around it:
- Logo, "Sign in to PhoneMail", "Use your phone number. New here? We'll create
  your address."
- Phone field (+91 default, country selectable).
- After the first Next: the code field appears in the same card under the
  phone field (the phone stays visible with an "Edit" link) plus the resend
  countdown.
- Directly above the button: "By signing up, you agree to the Terms of
  Service", with "Terms of Service" linking to `/terms` (new tab).
- One "Next" button: with a phone → sends the code; with a code → verifies,
  signs in (creating the account if needed, channel `web`) and opens `/mail`.
- Demo banner with the code, as on mobile.
- Password mode: phone + password with the same single button.

## Layout (Gmail-like)
- Top bar: menu toggle, logo + "PhoneMail", a wide rounded search box with a
  filter dropdown (from, has attachment, unread only), settings gear, avatar
  menu (account, switch to mobile view, log out).
- Left nav: large "Compose" button; Inbox (unread count), Starred, Sent,
  Drafts (count), Spam, Trash. Collapses to icons.
- List: toolbar (select all, refresh, mark read/unread, trash, spam,
  "1–50 of 312" with previous/next). Rows: checkbox, star, sender (bold when
  unread), subject – snippet (muted), paperclip, date (time for today,
  "12 Sep" this year, "12/09/2025" before). Hover shows quick actions.
  Rows group by threadId with a count ("Arjun, me 3").
- Reading view (replaces the list): subject with a folder chip; each message
  in the thread as an expandable card (sender, address, date, recipient
  details); sanitized HTML in the sandboxed iframe; attachments; Reply at the
  bottom, shown as "Replied" (links to the reply) when the user already
  replied to that message. Forward is not required.
- Compose: floating window bottom-right (minimize, full screen, close) with
  From (aliases), To/Cc/Bcc chips, Subject, Body, attach, Send, discard.
  Autosaves drafts. Sending to 2+ people also creates the group chat on mobile
  (same server logic).
- Keyboard shortcuts: c compose, / search, j/k next/previous, o or Enter open,
  r reply, s star, # trash, u back to list, ? shortcut help. Everything is also
  reachable with Tab and a visible focus ring.
- Realtime: new mail appears at the top of Inbox with a brief highlight; the
  tab title shows "(3) Inbox – PhoneMail".
- Responsive: the nav collapses under 1024px; under 768px a banner suggests
  the mobile view.

## Settings (`/mail/settings`)
Tabs: General (language, remote images, read receipts), Profile (photo, name,
about), Addresses (primary, aliases, default send-as), Devices (sessions),
Legal (Terms, Privacy). Same APIs and validation as mobile.

## Registration portal (`/register`)
Registration only, kiosk-like:
- Card: logo, "Create a PhoneMail address", exactly two fields: phone number
  and one-time code (the code field activates after the code is sent). One
  primary button that reads "Send code", then "Create address".
- Success: a green confirmation with the new address ("9876543210@phonemail.com
  is ready. Sign in on the PhoneMail app or on the web to read your email."),
  then both fields clear and focus returns to the phone field for the next
  person (after 4 seconds, or at once with "Create another").
- Already registered → inline message; no code is sent.
- Nobody is signed in here; no cookies are set.
- Password mode: phone + password, same reset behavior.

## Terms and privacy (`/terms`, `/privacy`)
Short, plain-language, honest pages for a hackathon product: what's stored
(number, emails, attachments), how SMS alerts work, no ads, how to ask for
deletion, and that it's a demo service.

## Demo console layout (`/demo`)
Desktop layout: the live SMS/OTP feed in the left column; simulators (IVR
call, inbound SMS, send email into PhoneMail with presets) and the users table
on the right. Behavior is in 06.
