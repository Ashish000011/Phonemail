import { describe, expect, it } from 'vitest';
import {
  buildAlertText,
  GSM7_LIMIT,
  isGsm7,
  smsUnits,
  UCS2_LIMIT,
} from '../src/modules/notifications/text.js';
import { alertDecision, type AlertCandidate } from '../src/modules/notifications/eligibility.js';
import {
  colorFor,
  conversationTitle,
  decodeCursor,
  encodeCursor,
  initialsFor,
  isLongText,
  type PersonInfo,
} from '../src/modules/conversations/presenter.js';

describe('SMS alert text', () => {
  it('uses the exact wording from the task', () => {
    expect(buildAlertText('Arjun (+91 90000 00002)', 'Lunch?')).toBe(
      'You have received an email from Arjun (+91 90000 00002). Subject: Lunch?.',
    );
  });

  it('says "(no subject)" for an empty subject', () => {
    expect(buildAlertText('x@gmail.com', '  ')).toBe(
      'You have received an email from x@gmail.com. Subject: (no subject).',
    );
  });

  it('shortens a long subject to fit one 160-character GSM-7 segment', () => {
    const text = buildAlertText('news@example.com', 'Weekly digest: '.repeat(20));
    expect(isGsm7(text)).toBe(true);
    expect(smsUnits(text, 'GSM-7')).toBeLessThanOrEqual(GSM7_LIMIT);
    expect(text).toContain('from news@example.com.');
    expect(text.endsWith('....')).toBe(true); // "..." then the closing "."
  });

  it('uses the 70-character limit when the text has Hindi or Tamil', () => {
    const text = buildAlertText('प्रिया', 'आज शाम की मीटिंग के बारे में ज़रूरी जानकारी');
    expect(isGsm7(text)).toBe(false);
    expect(smsUnits(text, 'UCS-2')).toBeLessThanOrEqual(UCS2_LIMIT);
    expect(text).toContain('from प्रिया.');
    expect(text).toContain('…');
  });

  it('shortens the sender only when the subject cannot make room', () => {
    const sender = `a-very-long-newsletter-address-${'x'.repeat(150)}@example.com`;
    const text = buildAlertText(sender, 'Hi');
    expect(smsUnits(text, 'GSM-7')).toBeLessThanOrEqual(GSM7_LIMIT);
    expect(text.startsWith('You have received an email from a-very-long')).toBe(true);
    expect(text.endsWith('Subject: ....')).toBe(true);
  });

  it('counts GSM-7 extension characters as two', () => {
    expect(smsUnits('a€b', 'GSM-7')).toBe(4);
    expect(smsUnits('😀', 'UCS-2')).toBe(2);
  });

  it('never splits an emoji', () => {
    const text = buildAlertText('Meera', '🎉'.repeat(40));
    expect(text).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    expect(smsUnits(text, 'UCS-2')).toBeLessThanOrEqual(UCS2_LIMIT);
  });
});

describe('SMS alert eligibility', () => {
  const base: AlertCandidate = {
    direction: 'incoming',
    isSpam: false,
    system: false,
    userId: 'u1',
    senderUserId: 'u2',
  };

  it('sends to users without the mobile app', () => {
    expect(alertDecision(base, false)).toEqual({ send: true });
  });

  it("doesn't send to users signed in on mobile", () => {
    expect(alertDecision(base, true)).toEqual({ send: false, reason: 'has-mobile-app' });
  });

  it.each([
    ['their own sent copy', { direction: 'outgoing' as const }, 'not-incoming'],
    ['spam', { isSpam: true }, 'spam'],
    ['welcome or bounce mail', { system: true }, 'system'],
    ['an email to themselves', { senderUserId: 'u1' }, 'own-email'],
  ])("doesn't send for %s", (_label, change, reason) => {
    expect(alertDecision({ ...base, ...change }, false)).toEqual({ send: false, reason });
  });
});

describe('chat titles and avatars', () => {
  const person = (overrides: Partial<PersonInfo>): PersonInfo => ({
    identityKey: 'u:1',
    userId: '1',
    address: '9000000002@phonemail.com',
    displayName: null,
    phoneE164: '+919000000002',
    avatarPath: null,
    contactName: null,
    ...overrides,
  });

  it('direct: contact name, then PhoneMail name, then number, then address', () => {
    expect(
      conversationTitle('direct', null, [
        person({ contactName: 'Arjun bhai', displayName: 'Arjun' }),
      ]),
    ).toBe('Arjun bhai');
    expect(conversationTitle('direct', null, [person({ displayName: 'Arjun Kumar' })])).toBe(
      'Arjun Kumar',
    );
    expect(conversationTitle('direct', null, [person({})])).toBe('+91 90000 00002');
    expect(
      conversationTitle('direct', null, [
        person({ userId: null, phoneE164: null, address: 'x@gmail.com' }),
      ]),
    ).toBe('x@gmail.com');
  });

  it('group: short names joined with commas, unless the owner renamed it', () => {
    const people = [person({ displayName: 'Arjun Kumar' }), person({ displayName: 'Meera Iyer' })];
    expect(conversationTitle('group', null, people)).toBe('Arjun, Meera');
    expect(conversationTitle('group', 'Family', people)).toBe('Family');
  });

  it('self chat has no title (the UI shows "You")', () => {
    expect(conversationTitle('self', null, [])).toBe('');
  });

  it('initials and stable colors', () => {
    expect(initialsFor('Arjun Kumar')).toBe('AK');
    expect(initialsFor('meera')).toBe('M');
    expect(initialsFor('+91 90000 00002')).toBe('');
    expect(colorFor('u:abc')).toBe(colorFor('u:abc'));
  });

  it('long emails are clamped', () => {
    expect(isLongText('short')).toBe(false);
    expect(isLongText('x'.repeat(701))).toBe(true);
    expect(isLongText('line\n'.repeat(13))).toBe(true);
  });

  it('cursors round-trip', () => {
    const at = new Date('2026-09-25T10:00:00Z');
    expect(decodeCursor(encodeCursor(at, 'abc'))).toEqual({ at, id: 'abc' });
    expect(decodeCursor('garbage')).toBeNull();
  });
});
