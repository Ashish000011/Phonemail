import { formatPhone } from '../addressing/index.js';

/**
 * How chats are named and drawn (docs/spec/05-conversations.md, "Titles and
 * avatars"). Pure functions, unit-tested. Colors and initials live in the
 * shared package so the apps draw people the same way.
 */
export { AVATAR_COLORS, colorFor, initialsFor } from '@phonemail/shared';

export interface PersonInfo {
  identityKey: string;
  userId: string | null;
  address: string;
  displayName: string | null;
  phoneE164: string | null;
  avatarPath: string | null;
  /** The name the chat owner saved for this number, if they shared contacts */
  contactName: string | null;
}

/** Contact name, else their PhoneMail name, else their number, else the address. */
export function personName(person: PersonInfo): string {
  return (
    person.contactName ||
    person.displayName ||
    (person.phoneE164 ? formatPhone(person.phoneE164) : person.address)
  );
}

/** "Arjun Kumar" → "Arjun"; numbers and addresses stay whole. */
export function shortName(name: string): string {
  return /^\p{L}/u.test(name) ? name.split(/\s+/)[0] : name;
}

export function conversationTitle(
  kind: 'direct' | 'group' | 'self',
  customTitle: string | null,
  people: PersonInfo[],
): string {
  if (kind === 'self') return '';
  if (kind === 'direct') return people[0] ? personName(people[0]) : '';
  return customTitle || people.map((p) => shortName(personName(p))).join(', ');
}

/** Over 700 characters or 12 lines: the bubble is clamped with "Read more". */
export function isLongText(text: string): boolean {
  return text.length > 700 || text.split('\n').length > 12;
}

/** Opaque cursor for "load more": the last item's time and id. */
export function encodeCursor(at: Date, id: string): string {
  return Buffer.from(`${at.toISOString()}|${id}`).toString('base64url');
}

export function decodeCursor(cursor: string): { at: Date; id: string } | null {
  const [iso, id] = Buffer.from(cursor, 'base64url').toString().split('|');
  const at = new Date(iso);
  return id && !Number.isNaN(at.getTime()) ? { at, id } : null;
}
