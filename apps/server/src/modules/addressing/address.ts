/**
 * Email address helpers. Addresses are compared lowercased; our own domain's
 * local parts may carry a +tag (9876543210+news@…) that still reaches the owner.
 */

export interface ParsedAddress {
  /** Lowercased full address, as given */
  address: string;
  /** The part before @, without any +tag */
  localPart: string;
  /** The +tag, if any ("news" in 9876543210+news@…) */
  plusTag?: string;
  domain: string;
  /** True when the domain is ours (MAIL_DOMAIN) */
  isLocal: boolean;
}

// Deliberately simple: one @, something before it, a dotted domain after it.
const EMAIL_PATTERN = /^[^\s@<>()[\]\\,;:"]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_PATTERN.test(value.trim());
}

export function parseAddress(value: string, mailDomain: string): ParsedAddress | null {
  const address = value.trim().toLowerCase();
  if (!isValidEmail(address)) return null;
  const at = address.lastIndexOf('@');
  const fullLocal = address.slice(0, at);
  const domain = address.slice(at + 1);
  const plus = fullLocal.indexOf('+');
  const localPart = plus === -1 ? fullLocal : fullLocal.slice(0, plus);
  const plusTag = plus === -1 ? undefined : fullLocal.slice(plus + 1) || undefined;
  if (!localPart) return null;
  return {
    address,
    localPart,
    plusTag,
    domain,
    isLocal: domain === mailDomain.toLowerCase(),
  };
}

export function formatAddress(localPart: string, mailDomain: string): string {
  return `${localPart}@${mailDomain}`;
}
