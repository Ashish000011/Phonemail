import { describe, expect, it } from 'vitest';
import { isValidRecipient } from './RecipientField';

describe('isValidRecipient', () => {
  it.each([
    '9876543210',
    '+91 98765 43210',
    '+1 (415) 555-0100',
    '9876543210@phonemail.com',
    'meera@example.co.in',
  ])('accepts %s', (value) => {
    expect(isValidRecipient(value)).toBe(true);
  });

  it.each(['12345', 'meera', 'meera@example', '@example.com', 'a b@example.com', '98765abc10'])(
    'rejects %s',
    (value) => {
      expect(isValidRecipient(value)).toBe(false);
    },
  );
});
