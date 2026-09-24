import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { localPartFor } from '@phonemail/shared';

/**
 * Client-side preview only ("Your address: 9876543210@phonemail.com").
 * The server re-checks every number; this just gives instant feedback.
 */
export function previewAddress(input: string, mailDomain: string): string | null {
  const parsed = parsePhoneNumberFromString(input.trim(), 'IN');
  if (!parsed || !parsed.isValid()) return null;
  return `${localPartFor(parsed.countryCallingCode, parsed.nationalNumber)}@${mailDomain}`;
}

/** +919876543210 → "+91 98765 43210" */
export function formatPhone(e164: string): string {
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
}
