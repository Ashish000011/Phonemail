import { hash, verify } from '@node-rs/argon2';
import { MIN_PASSWORD_LENGTH } from '@phonemail/shared';
import { AppError } from '../../lib/errors.js';

/**
 * Password fallback (only when OTP can't be used, or AUTH_MODE says so).
 * argon2id (the library default) is slow on purpose, so guessing is expensive.
 */
export async function hashPassword(password: string): Promise<string> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AppError(
      400,
      'PASSWORD_TOO_SHORT',
      `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }
  return hash(password);
}

/**
 * The 6-digit PIN a phone-call sign-up hears in password mode. It's shorter
 * than a password may be, so the account is marked mustChangePassword: until
 * a real password is set, the sign-in guard allows nothing but changing it.
 */
export async function hashTemporaryPin(pin: string): Promise<string> {
  return hash(pin);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}
