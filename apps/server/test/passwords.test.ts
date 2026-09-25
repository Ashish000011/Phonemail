import { describe, expect, it } from 'vitest';
import { hashPassword, hashTemporaryPin, verifyPassword } from '../src/modules/auth/passwords.js';

describe('passwords (fallback mode)', () => {
  it('refuses passwords shorter than 8 characters', async () => {
    await expect(hashPassword('short')).rejects.toMatchObject({ code: 'PASSWORD_TOO_SHORT' });
  });

  it('stores an argon2id hash, never the password', async () => {
    const stored = await hashPassword('trekking-2026');
    expect(stored.startsWith('$argon2id$')).toBe(true);
    expect(stored).not.toContain('trekking-2026');
  });

  it('accepts the right password and rejects a wrong one', async () => {
    const stored = await hashPassword('trekking-2026');
    expect(await verifyPassword(stored, 'trekking-2026')).toBe(true);
    expect(await verifyPassword(stored, 'trekking-2025')).toBe(false);
  });

  it('a temporary 6-digit PIN from a phone call can be hashed and checked', async () => {
    const stored = await hashTemporaryPin('042917');
    expect(await verifyPassword(stored, '042917')).toBe(true);
    expect(await verifyPassword(stored, '042918')).toBe(false);
  });

  it('a damaged hash means "wrong password", not a crash', async () => {
    expect(await verifyPassword('not-a-hash', 'anything')).toBe(false);
  });
});
