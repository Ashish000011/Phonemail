import {
  emailIdentity,
  parseAddress,
  userIdentity,
  type IdentityKey,
} from '../addressing/index.js';

/**
 * Which chat an email belongs to, for one user (docs/spec/05-conversations.md,
 * "Keying rule"). Pure functions: the ingest pipeline looks up users first,
 * then asks these where each copy goes.
 */

export type ConversationKind = 'self' | 'direct' | 'group';

export interface KeyingInput {
  /** The user whose chat list we're filing into */
  owner: IdentityKey;
  from: IdentityKey;
  to: IdentityKey[];
  cc: IdentityKey[];
}

export interface KeyingResult {
  kind: ConversationKind;
  /** The other people in the chat, sorted, without duplicates */
  others: IdentityKey[];
}

export function conversationFor({ owner, from, to, cc }: KeyingInput): KeyingResult {
  // Bcc never counts: it isn't in the headers anyone else sees.
  const visible = new Set<IdentityKey>([from, ...to, ...cc]);

  // Rule 1: only a Bcc recipient → the 1:1 chat with the sender.
  if (!visible.has(owner)) return { kind: 'direct', others: [from] };

  // Rule 2: everyone visible except me. Rules 3–5: none, one, or several.
  visible.delete(owner);
  const others = [...visible].sort();
  const kind: ConversationKind =
    others.length === 0 ? 'self' : others.length === 1 ? 'direct' : 'group';
  return { kind, others };
}

/**
 * Address → identity. PhoneMail users collapse to u:<id> whichever address
 * they use (primary, alias, plus address); everyone else is e:<address>.
 * `userIdForLocalPart` answers from a lookup the caller prepared.
 */
export function identityForAddress(
  address: string,
  mailDomain: string,
  userIdForLocalPart: (localPart: string) => string | null | undefined,
): IdentityKey {
  const parsed = parseAddress(address, mailDomain);
  if (parsed?.isLocal) {
    const userId = userIdForLocalPart(parsed.localPart);
    if (userId) return userIdentity(userId);
  }
  return emailIdentity(parsed?.address ?? address);
}
