import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * TwiML is the XML Twilio reads to know what to say and do on a call.
 * Small, pure builders, so every script is unit-tested and the demo
 * console's simulator shows exactly what a caller would hear.
 */

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface Voice {
  voice: string;
  language: string;
}

export const say = (text: string, v: Voice) =>
  `<Say voice="${escapeXml(v.voice)}" language="${escapeXml(v.language)}">${escapeXml(text)}</Say>`;
export const pause = (seconds: number) => `<Pause length="${seconds}"/>`;
export const redirect = (url: string) => `<Redirect method="POST">${escapeXml(url)}</Redirect>`;
export const hangup = () => '<Hangup/>';
export const gather = (action: string, inner: string) =>
  `<Gather input="dtmf" numDigits="1" timeout="7" action="${escapeXml(action)}" method="POST">${inner}</Gather>`;

export function response(...verbs: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${verbs.join('')}</Response>`;
}

/**
 * "9876543210" → "9 8 7 6 5, 4 3 2 1 0": digit by digit in groups of five,
 * with a pause between groups, so callers can write it down.
 */
export function spokenDigits(digits: string): string {
  const groups: string[] = [];
  for (let i = 0; i < digits.length; i += 5) {
    const group = digits.slice(i, i + 5);
    groups.push([...group].join(' '));
  }
  return groups.join(', ');
}

/** "phonemail.com" → "phonemail dot com" */
export function spokenDomain(domain: string): string {
  return domain.split('.').join(' dot ');
}

/**
 * Twilio signs every webhook: base64(HMAC-SHA1(authToken, url + each
 * param name and value, sorted by name)). A request without a valid
 * signature didn't come from Twilio, so it's refused.
 */
export function twilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): string {
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((key) => key + params[key])
      .join('');
  return createHmac('sha1', authToken).update(data, 'utf8').digest('base64');
}

export function validTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signature: string | undefined,
): boolean {
  if (!signature) return false;
  const expected = Buffer.from(twilioSignature(authToken, url, params));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
