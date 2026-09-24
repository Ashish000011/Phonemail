import { describe, expect, it } from 'vitest';
import { conversationFor, identityForAddress } from '../src/modules/conversations/keying.js';
import { participantKey, type IdentityKey } from '../src/modules/addressing/index.js';

/**
 * The example table from docs/spec/05-conversations.md, row by row.
 * U = 9000000001, A = 9000000002 (alias "arjun"), B = 9000000003, X = x@gmail.com.
 */
const DOMAIN = 'phonemail.com';
const users: Record<string, string> = {
  '9000000001': 'U',
  '9000000002': 'A',
  arjun: 'A',
  '9000000003': 'B',
};
const id = (address: string): IdentityKey =>
  identityForAddress(address, DOMAIN, (localPart) => users[localPart]);

const U = 'u:U';
const A = 'u:A';
const B = 'u:B';
const X = 'e:x@gmail.com';

interface Email {
  from: string;
  to: string[];
  cc?: string[];
}

/** U's chat for this email, as the others' identity keys. */
function chatFor(email: Email, owner: IdentityKey = U) {
  return conversationFor({
    owner,
    from: id(email.from),
    to: email.to.map(id),
    cc: (email.cc ?? []).map(id),
  });
}

const u = '9000000001@phonemail.com';
const a = '9000000002@phonemail.com';
const b = '9000000003@phonemail.com';
const x = 'x@gmail.com';

describe('conversation keying (spec table)', () => {
  it('A → U: direct(A)', () => {
    expect(chatFor({ from: a, to: [u] })).toEqual({ kind: 'direct', others: [A] });
  });

  it('U → A: direct(A)', () => {
    expect(chatFor({ from: u, to: [a] })).toEqual({ kind: 'direct', others: [A] });
  });

  it('U → A where A sends from alias arjun@: direct(A) (aliases collapse)', () => {
    expect(chatFor({ from: 'arjun@phonemail.com', to: [u] })).toEqual({
      kind: 'direct',
      others: [A],
    });
  });

  it('A (from 9000000002+work@) → U: direct(A) (plus addresses collapse)', () => {
    expect(chatFor({ from: '9000000002+work@phonemail.com', to: [u] })).toEqual({
      kind: 'direct',
      others: [A],
    });
  });

  it('U → A, B from Home compose: group(A, B)', () => {
    expect(chatFor({ from: u, to: [a, b] })).toEqual({ kind: 'group', others: [A, B] });
  });

  it('U → B, A (same people, other order): the same group', () => {
    const first = chatFor({ from: u, to: [a, b] });
    const second = chatFor({ from: u, to: [b, a] });
    expect(participantKey(second.others).hash).toBe(participantKey(first.others).hash);
  });

  it('A → U, B: group(A, B)', () => {
    expect(chatFor({ from: a, to: [u, b] })).toEqual({ kind: 'group', others: [A, B] });
  });

  it('B → U, cc A: group(A, B)', () => {
    expect(chatFor({ from: b, to: [u], cc: [a] })).toEqual({ kind: 'group', others: [A, B] });
  });

  it('U → A as a new email after the group exists: direct(A), not the group', () => {
    expect(chatFor({ from: u, to: [a] })).toEqual({ kind: 'direct', others: [A] });
  });

  it('X → U: direct(X)', () => {
    expect(chatFor({ from: x, to: [u] })).toEqual({ kind: 'direct', others: [X] });
  });

  it('U → U: self', () => {
    expect(chatFor({ from: u, to: [u] })).toEqual({ kind: 'self', others: [] });
  });

  it('A → U, bcc B: for B it is direct(A)', () => {
    // B is only on the envelope, not in To/Cc.
    expect(chatFor({ from: a, to: [u] }, B)).toEqual({ kind: 'direct', others: [A] });
  });
});

describe('keying details', () => {
  it('ignores case and duplicates', () => {
    expect(chatFor({ from: 'X@Gmail.com', to: [u, u], cc: [u] })).toEqual({
      kind: 'direct',
      others: [X],
    });
  });

  it('an unknown local address is treated as an outside address', () => {
    expect(id('nobody@phonemail.com')).toBe('e:nobody@phonemail.com');
  });

  it('a reply from an outside app that drops people lands in the 1:1 chat', () => {
    // Group was A, B, U. A replies only to U.
    expect(chatFor({ from: a, to: [u] })).toEqual({ kind: 'direct', others: [A] });
  });
});
