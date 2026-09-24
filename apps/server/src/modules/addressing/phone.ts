import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max';
import { localPartFor } from '@phonemail/shared';
import { AppError } from '../../lib/errors.js';

/**
 * Phone numbers are identities in PhoneMail, so every number is normalized the
 * same way before we store or compare it (docs/spec/02-data-model.md).
 */
export interface NormalizedPhone {
  /** +919876543210: what we store */
  e164: string;
  /** 9876543210 (India) or 0014155550123 (elsewhere): the primary address's local part */
  localPart: string;
  /** +91 98765 43210: what people read */
  display: string;
  countryCallingCode: string;
}

/** Number types that can't receive SMS or aren't personal. */
const REJECTED_TYPES = new Set([
  'FIXED_LINE',
  'TOLL_FREE',
  'PREMIUM_RATE',
  'SHARED_COST',
  'UAN',
  'VOICEMAIL',
  'PAGER',
]);

// The address rule lives in @phonemail/shared so the UIs preview the same address.
export { localPartFor };

/** Returns null for anything that isn't a valid mobile-capable number. */
export function tryNormalizePhone(input: string, defaultCountry: string): NormalizedPhone | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 32) return null;
  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry as CountryCode);
  if (!parsed || !parsed.isValid()) return null;
  const type = parsed.getType();
  if (type && REJECTED_TYPES.has(type)) return null;
  return {
    e164: parsed.number,
    localPart: localPartFor(parsed.countryCallingCode, parsed.nationalNumber),
    display: parsed.formatInternational(),
    countryCallingCode: parsed.countryCallingCode,
  };
}

/** Like tryNormalizePhone, but throws INVALID_PHONE (400) for the API. */
export function normalizePhone(input: string, defaultCountry: string): NormalizedPhone {
  const phone = tryNormalizePhone(input, defaultCountry);
  if (!phone) {
    throw new AppError(400, 'INVALID_PHONE', 'That is not a valid mobile number.');
  }
  return phone;
}

/** +919876543210 → "+91 98765 43210" (falls back to the input). */
export function formatPhone(e164: string): string {
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
}

/**
 * The reverse of localPartFor: 9876543210 → +919876543210,
 * 0014155550123 → +14155550123. Null if it isn't a primary local part.
 */
export function phoneFromLocalPart(localPart: string): string | null {
  if (/^[6-9]\d{9}$/.test(localPart)) return `+91${localPart}`;
  if (/^00[1-9]\d{6,14}$/.test(localPart)) return `+${localPart.slice(2)}`;
  return null;
}
