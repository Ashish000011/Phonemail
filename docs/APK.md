# The Android app (APK)

PhoneMail's APK is a **Trusted Web Activity** (TWA): the mobile web app
(`/m`) running full screen in Chrome, packaged as an Android app. Same code,
same WhatsApp-style screens, no browser address bar. Sign-in codes are read
automatically through Chrome (WebOTP), as on the website. It is not a native
app: it needs the server and the public address to be up.

## How it was built

With [PWABuilder](https://www.pwabuilder.com) (Microsoft's free packager),
"Package For Stores" → Google Play, with these settings:

| Setting | Value |
|---|---|
| Package ID | `app.phonemail.twa` |
| App name / short name | PhoneMail |
| Host | `phonemail.bilberry-carat.ts.net` (the Tailscale Funnel address) |
| Start URL | `/m` |
| Version / version code | 1.1.0.0 / 2 |
| Signing key | New |
| Everything else | Defaults (colours and icons come from our manifest) |

The first build (1.0) pointed at the ngrok address. ngrok's free plan shows
browsers a "You are about to visit" page, and Chrome on the phone got that
page instead of `assetlinks.json`, so the app showed an address bar. With
Tailscale Funnel nothing sits in front of the site: PWABuilder reads it
directly and the site check passes (DECISIONS 84).

## The files

PWABuilder's zip holds:

- `PhoneMail.apk`: install this on a phone.
- `PhoneMail.aab`: the format Google Play takes (not used here).
- `assetlinks.json`: public; copied to
  `apps/web/public/.well-known/assetlinks.json`. It tells Android that the
  app and the site belong together, so the app opens without an address bar.
- `signing.keystore` and `signing-key-info.txt`: **private** (the signing key
  and its passwords). Kept outside the repo and never committed. Without them
  the installed app can't be updated; a rebuild with a new key also needs a
  new `assetlinks.json`.

## Installing

1. Copy `PhoneMail.apk` to the phone (USB, Drive, or a chat to yourself).
2. Open it and allow "Install unknown apps" for the app you opened it from.
3. Play Protect may warn about an unknown developer (it's not from the Play
   Store): choose **Install anyway**.
4. Open PhoneMail. If you're already signed in to the site in Chrome, the
   app is signed in too (they share Chrome's storage). An app built with a
   different key must be uninstalled first.

## Limits

- It opens only the host it was built for. A new public address means a new
  APK (and a new `assetlinks.json` if the key changes).
- If an address bar shows at the top, Android couldn't check
  `assetlinks.json`; the app still works.
- No notifications while closed (the web app has no push), and no offline
  mode beyond the web app's cache.
