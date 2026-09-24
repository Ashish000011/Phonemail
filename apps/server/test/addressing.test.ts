import { describe, expect, it } from 'vitest';
import {
  checkAliasFormat,
  emailIdentity,
  formatAddress,
  formatPhone,
  isValidEmail,
  localPartFor,
  normalizePhone,
  parseAddress,
  participantKey,
  phoneFromLocalPart,
  tryNormalizePhone,
  userIdentity,
  userIdFromIdentity,
} from '../src/modules/addressing/index.js';

describe('phone normalization', () => {
  it.each(['9876543210', '98765 43210', '+91 98765-43210', '09876543210', '+919876543210'])(
    'accepts "%s" as the same Indian number',
    (input) => {
      expect(tryNormalizePhone(input, 'IN')).toEqual({
        e164: '+919876543210',
        localPart: '9876543210',
        display: '+91 98765 43210',
        countryCallingCode: '91',
      });
    },
  );

  it('gives other countries 00 + country code + number', () => {
    expect(tryNormalizePhone('+1 650 253 0000', 'IN')).toMatchObject({
      e164: '+16502530000',
      localPart: '0016502530000',
    });
    expect(tryNormalizePhone('+44 7911 123456', 'IN')?.localPart).toBe('00447911123456');
  });

  it.each([
    ['too short', '12345'],
    ['landline', '+91 22 2345 6789'],
    ['letters', 'hello'],
    ['empty', ''],
    ['absurdly long', '9'.repeat(40)],
  ])('rejects %s', (_label, input) => {
    expect(tryNormalizePhone(input, 'IN')).toBeNull();
  });

  it('normalizePhone throws INVALID_PHONE for the API', () => {
    expect(() => normalizePhone('12345', 'IN')).toThrow(
      expect.objectContaining({ code: 'INVALID_PHONE', statusCode: 400 }),
    );
  });

  it('formats for display', () => {
    expect(formatPhone('+919876543210')).toBe('+91 98765 43210');
  });

  it('local part formats cannot collide', () => {
    // Indian mobiles never start with 0; every non-Indian local part does.
    expect(localPartFor('91', '9876543210')).toBe('9876543210');
    expect(localPartFor('1', '6502530000')).toBe('0016502530000');
  });

  it('maps a primary local part back to the phone number', () => {
    expect(phoneFromLocalPart('9876543210')).toBe('+919876543210');
    expect(phoneFromLocalPart('0016502530000')).toBe('+16502530000');
    expect(phoneFromLocalPart('arjun')).toBeNull();
    expect(phoneFromLocalPart('1234567890')).toBeNull();
  });
});

describe('addresses', () => {
  const domain = 'phonemail.com';

  it('parses local addresses, lowercased', () => {
    expect(parseAddress('9876543210@PhoneMail.com', domain)).toEqual({
      address: '9876543210@phonemail.com',
      localPart: '9876543210',
      plusTag: undefined,
      domain: 'phonemail.com',
      isLocal: true,
    });
  });

  it('splits plus addresses', () => {
    expect(parseAddress('9876543210+news@phonemail.com', domain)).toMatchObject({
      localPart: '9876543210',
      plusTag: 'news',
      isLocal: true,
    });
    expect(parseAddress('arjun+work@phonemail.com', domain)).toMatchObject({
      localPart: 'arjun',
      plusTag: 'work',
    });
  });

  it('marks other domains as external', () => {
    expect(parseAddress('x@gmail.com', domain)?.isLocal).toBe(false);
  });

  it.each(['no-at-sign', 'a@b', '@phonemail.com', 'a b@c.com', 'a@@c.com'])(
    'rejects "%s"',
    (value) => {
      expect(parseAddress(value, domain)).toBeNull();
      expect(isValidEmail(value)).toBe(false);
    },
  );

  it('formats addresses', () => {
    expect(formatAddress('9876543210', domain)).toBe('9876543210@phonemail.com');
  });
});

describe('alias rules', () => {
  it.each(['arjun', 'Arjun.Kumar', 'meera_99', 'dev-team', 'abc'])('accepts "%s"', (name) => {
    expect(checkAliasFormat(name)).toEqual({ ok: true, localPart: name.toLowerCase() });
  });

  it.each([
    ['too short', 'ab'],
    ['too long', 'a'.repeat(31)],
    ['all digits', '9876543210'],
    ['starts with 00', '0012345'],
    ['starts with a digit', '1arjun'],
    ['consecutive dots', 'arjun..k'],
    ['trailing dot', 'arjun.'],
    ['plus sign', 'arjun+x'],
    ['space', 'arjun k'],
    ['non-latin', 'अर्जुन'],
  ])('rejects %s as invalid', (_label, name) => {
    expect(checkAliasFormat(name)).toEqual({ ok: false, reason: 'ALIAS_INVALID' });
  });

  it.each(['admin', 'postmaster', 'Support', 'no-reply', 'mailer-daemon', 'phonemailteam'])(
    'rejects "%s" as reserved',
    (name) => {
      expect(checkAliasFormat(name)).toEqual({ ok: false, reason: 'ALIAS_RESERVED' });
    },
  );
});

describe('identity keys', () => {
  it('builds and reads keys', () => {
    expect(userIdentity('abc')).toBe('u:abc');
    expect(emailIdentity(' X@Gmail.com ')).toBe('e:x@gmail.com');
    expect(userIdFromIdentity('u:abc')).toBe('abc');
    expect(userIdFromIdentity('e:x@gmail.com')).toBeNull();
  });

  it('the same people in any order give the same participant key', () => {
    const a = participantKey([userIdentity('b'), userIdentity('a')]);
    const b = participantKey([userIdentity('a'), userIdentity('b'), userIdentity('a')]);
    expect(a).toEqual(b);
    expect(a.keys).toEqual(['u:a', 'u:b']);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('different people give different keys', () => {
    expect(participantKey([userIdentity('a')]).hash).not.toBe(
      participantKey([userIdentity('a'), emailIdentity('x@gmail.com')]).hash,
    );
  });
});
