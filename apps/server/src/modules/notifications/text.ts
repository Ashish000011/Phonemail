/**
 * The SMS alert, in the task's exact words (docs/spec/06):
 *   "You have received an email from <Sender>. Subject: <Subject>."
 * It must fit in ONE SMS segment, so it never costs (or splits into) two:
 *   - 160 characters when every character is in the GSM-7 alphabet
 *   - 70 when it isn't (Hindi, Tamil, emoji: the phone switches to UCS-2)
 * Too long? Shorten the subject first, then the sender.
 */

// The GSM 03.38 alphabet. Characters in the extension table take two slots.
const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXTENDED = '^{}\\[~]|€\f';

export const GSM7_LIMIT = 160;
export const UCS2_LIMIT = 70;

export type SmsEncoding = 'GSM-7' | 'UCS-2';

export function isGsm7(text: string): boolean {
  return [...text].every((ch) => GSM7_BASIC.includes(ch) || GSM7_EXTENDED.includes(ch));
}

/** How many slots of a segment the text uses in that encoding. */
export function smsUnits(text: string, encoding: SmsEncoding): number {
  if (encoding === 'UCS-2') return text.length; // UTF-16 code units; an emoji takes 2
  return [...text].reduce((sum, ch) => sum + (GSM7_EXTENDED.includes(ch) ? 2 : 1), 0);
}

function limitFor(encoding: SmsEncoding) {
  return encoding === 'GSM-7' ? GSM7_LIMIT : UCS2_LIMIT;
}

/** Cuts text to fit `max` units, ending with the ellipsis. Never splits an emoji. */
function shorten(text: string, max: number, ellipsis: string, encoding: SmsEncoding): string {
  if (smsUnits(text, encoding) <= max) return text;
  const room = max - smsUnits(ellipsis, encoding);
  let result = '';
  for (const ch of text) {
    if (smsUnits(result + ch, encoding) > room) break;
    result += ch;
  }
  return result.trimEnd() + ellipsis;
}

const compose = (sender: string, subject: string) =>
  `You have received an email from ${sender}. Subject: ${subject}.`;

export function buildAlertText(sender: string, subject: string): string {
  const subjectText = subject.trim() || '(no subject)';
  const full = compose(sender, subjectText);
  const encoding: SmsEncoding = isGsm7(full) ? 'GSM-7' : 'UCS-2';
  const limit = limitFor(encoding);
  if (smsUnits(full, encoding) <= limit) return full;

  // "…" isn't in GSM-7 (it would switch the whole SMS to UCS-2), so use "...".
  const ellipsis = encoding === 'GSM-7' ? '...' : '…';
  const fixed = smsUnits(compose('', ''), encoding);

  // 1. Shorten the subject, keeping the whole sender if we can.
  const roomForSubject = limit - fixed - smsUnits(sender, encoding);
  if (roomForSubject >= smsUnits(ellipsis, encoding) + 1) {
    return compose(sender, shorten(subjectText, roomForSubject, ellipsis, encoding));
  }
  // 2. The sender alone is too long: subject becomes "…", the sender is shortened.
  const roomForSender = limit - fixed - smsUnits(ellipsis, encoding);
  return compose(shorten(sender, roomForSender, ellipsis, encoding), ellipsis);
}
