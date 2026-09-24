import { createHash } from 'node:crypto';

/**
 * Who a participant is. A PhoneMail user is one identity whichever of their
 * addresses they use (primary, alias, plus address); anyone else is their
 * lowercased address. Chats are keyed by these (docs/spec/05-conversations.md).
 */
export type IdentityKey = `u:${string}` | `e:${string}`;

export function userIdentity(userId: string): IdentityKey {
  return `u:${userId}`;
}

export function emailIdentity(address: string): IdentityKey {
  return `e:${address.trim().toLowerCase()}`;
}

/** The user id inside a u: key, or null for an outside address. */
export function userIdFromIdentity(key: string): string | null {
  return key.startsWith('u:') ? key.slice(2) : null;
}

export interface ParticipantKey {
  /** Sorted, without duplicates, so the same people always give the same key */
  keys: IdentityKey[];
  /** SHA-256 of the joined keys: the fixed-size value we index on */
  hash: string;
}

export function participantKey(identities: Iterable<IdentityKey>): ParticipantKey {
  const keys = [...new Set(identities)].sort();
  const hash = createHash('sha256').update(keys.join('|')).digest('hex');
  return { keys, hash };
}
