/**
 * Alias rules (docs/spec/02-data-model.md). Pure checks only; uniqueness and
 * the 30-day hold are checked against the database in modules/aliases.
 */

export const MAX_ALIASES_PER_USER = 5;
export const ALIAS_HOLD_DAYS = 30;

/** Names that could be used to impersonate the service. */
export const RESERVED_ALIASES = new Set([
  'admin',
  'administrator',
  'postmaster',
  'abuse',
  'hostmaster',
  'webmaster',
  'root',
  'support',
  'help',
  'info',
  'noreply',
  'no-reply',
  'security',
  'billing',
  'welcome',
  'system',
  'team',
  'mailer-daemon',
]);

export type AliasProblem =
  | 'ALIAS_INVALID' // wrong characters or length
  | 'ALIAS_RESERVED'; // a reserved or system name

export type AliasCheck = { ok: true; localPart: string } | { ok: false; reason: AliasProblem };

// Starts with a letter, then 2–29 of a-z, 0-9, dot, underscore, hyphen (3–30 total).
const ALIAS_PATTERN = /^[a-z][a-z0-9._-]{2,29}$/;

export function checkAliasFormat(input: string): AliasCheck {
  const localPart = input.trim().toLowerCase();
  // Starting with a letter already rules out all-digit names and the 00 prefix,
  // so an alias can never look like someone's phone-number address.
  if (!ALIAS_PATTERN.test(localPart)) return { ok: false, reason: 'ALIAS_INVALID' };
  if (localPart.includes('..') || localPart.endsWith('.')) {
    return { ok: false, reason: 'ALIAS_INVALID' };
  }
  if (RESERVED_ALIASES.has(localPart) || localPart.startsWith('phonemail')) {
    return { ok: false, reason: 'ALIAS_RESERVED' };
  }
  return { ok: true, localPart };
}
