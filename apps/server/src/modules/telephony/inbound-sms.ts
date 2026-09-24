import { tryNormalizePhone } from '../addressing/index.js';

/**
 * What to do with an incoming text (docs/spec/06, "SMS account creation").
 * Pure, so the rules are unit-tested.
 *
 * The SMSGate phone is a personal phone: it also receives bank OTPs and
 * messages from friends. So on that channel only texts starting with the
 * signup keyword (JOIN) count, and senders that aren't phone numbers
 * ("VM-HDFCBK") are ignored. The Twilio number exists only for PhoneMail, so
 * any text there signs you up, as the task asks.
 */
export type SmsSource = 'twilio' | 'smsgate';

export type InboundSmsAction =
  | { kind: 'ignore'; reason: 'not-a-phone-number' | 'no-keyword' }
  | { kind: 'help'; phoneE164: string }
  | { kind: 'join'; phoneE164: string };

const HELP_WORDS = new Set(['HELP', 'INFO']);

export function classifyInboundSms(
  source: SmsSource,
  sender: string,
  body: string,
  options: { keyword: string; defaultCountry: string },
): InboundSmsAction {
  const phone = tryNormalizePhone(sender, options.defaultCountry);
  if (!phone) return { kind: 'ignore', reason: 'not-a-phone-number' };

  const firstWord = body.trim().split(/\s+/)[0]?.toUpperCase() ?? '';
  if (HELP_WORDS.has(firstWord)) return { kind: 'help', phoneE164: phone.e164 };

  const keyword = options.keyword.trim().toUpperCase();
  if (source === 'smsgate' && keyword !== '*' && firstWord !== keyword) {
    return { kind: 'ignore', reason: 'no-keyword' };
  }
  return { kind: 'join', phoneE164: phone.e164 };
}
