import {
  checkAliasFormat,
  formatAddress,
  isValidEmail,
  tryNormalizePhone,
} from '../addressing/index.js';

/**
 * What people type in To/Cc/Bcc: a phone number ("98765 43210"), a
 * PhoneMail alias ("arjun") or any email address. Returns the address to
 * send to, or null if it's none of those.
 */
export function parseRecipient(
  input: string,
  mailDomain: string,
  defaultCountry: string,
): string | null {
  const value = input.trim();
  if (!value) return null;

  if (value.includes('@')) return isValidEmail(value) ? value.toLowerCase() : null;

  // Only digits and phone punctuation: treat it as a phone number.
  if (/^[+\d\s().-]+$/.test(value)) {
    const phone = tryNormalizePhone(value, defaultCountry);
    return phone ? formatAddress(phone.localPart, mailDomain) : null;
  }

  const alias = checkAliasFormat(value);
  return alias.ok ? formatAddress(alias.localPart, mailDomain) : null;
}
