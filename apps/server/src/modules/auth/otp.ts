import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { AppError } from '../../lib/errors.js';
import type { KeyValueStore } from '../../lib/kv.js';

/**
 * One-time codes (docs/spec/03-auth-and-accounts.md). Codes live in Redis for
 * 5 minutes, only as an HMAC hash, and every limit below is enforced here on
 * the server.
 */
export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 30;
export const OTP_MAX_PER_NUMBER_PER_HOUR = 5;
export const OTP_MAX_PER_IP_PER_HOUR = 20;
const HOUR = 60 * 60;

/** register = the portal; login = web and mobile (creates the account if needed). */
export type OtpPurpose = 'register' | 'login';

interface StoredChallenge {
  hash: string;
  attempts: number;
  createdAt: number;
}

function rateLimited(retryAfterSeconds: number, message: string): AppError {
  return new AppError(429, 'RATE_LIMITED', message, { retryAfterSeconds });
}

export class OtpService {
  constructor(
    private readonly store: KeyValueStore,
    private readonly pepper: string,
  ) {}

  private challengeKey(purpose: OtpPurpose, phoneE164: string) {
    return `otp:${purpose}:${phoneE164}`;
  }

  /**
   * HMAC with a server-side pepper: even with a copy of Redis, nobody can
   * work backwards from the stored hash to the code.
   */
  private hash(purpose: OtpPurpose, phoneE164: string, code: string): string {
    return createHmac('sha256', this.pepper)
      .update(`${purpose}:${phoneE164}:${code}`)
      .digest('hex');
  }

  /**
   * Call before sending a code. Throws RATE_LIMITED (with retryAfterSeconds)
   * during the 30-second resend cooldown, after 5 codes per number per hour,
   * or after 20 requests per IP address per hour.
   */
  async checkRequestLimits(phoneE164: string, ip: string): Promise<void> {
    const cooldownKey = `otp:cooldown:${phoneE164}`;
    const cooldownLeft = await this.store.ttl(cooldownKey);
    if (cooldownLeft > 0) throw rateLimited(cooldownLeft, 'Wait a moment before asking again.');

    const ipKey = `otp:ip:${ip}`;
    if ((await this.store.increment(ipKey, HOUR)) > OTP_MAX_PER_IP_PER_HOUR) {
      throw rateLimited(await this.store.ttl(ipKey), 'Too many code requests from this network.');
    }

    const numberKey = `otp:count:${phoneE164}`;
    if ((await this.store.increment(numberKey, HOUR)) > OTP_MAX_PER_NUMBER_PER_HOUR) {
      throw rateLimited(await this.store.ttl(numberKey), 'Too many codes for this number.');
    }

    // Start the cooldown last, so a request refused above doesn't lock the number.
    // setIfAbsent also catches two requests racing past the first check.
    if (!(await this.store.setIfAbsent(cooldownKey, '1', OTP_RESEND_COOLDOWN_SECONDS))) {
      throw rateLimited(await this.store.ttl(cooldownKey), 'Wait a moment before asking again.');
    }
  }

  /** Creates a fresh 6-digit code (replacing any earlier one) and returns it for sending. */
  async issue(phoneE164: string, purpose: OtpPurpose): Promise<string> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const challenge: StoredChallenge = {
      hash: this.hash(purpose, phoneE164, code),
      attempts: 0,
      createdAt: Date.now(),
    };
    await this.store.set(
      this.challengeKey(purpose, phoneE164),
      JSON.stringify(challenge),
      OTP_TTL_SECONDS,
    );
    return code;
  }

  /**
   * Resolves if the code is right (and uses it up). Otherwise throws
   * OTP_EXPIRED, OTP_INVALID (with attemptsLeft) or OTP_TOO_MANY_ATTEMPTS.
   */
  async verify(phoneE164: string, purpose: OtpPurpose, code: string): Promise<void> {
    const key = this.challengeKey(purpose, phoneE164);
    const raw = await this.store.get(key);
    if (!raw) {
      throw new AppError(400, 'OTP_EXPIRED', 'The code has expired. Ask for a new one.');
    }
    const challenge = JSON.parse(raw) as StoredChallenge;

    // Compare in constant time, so response timing doesn't leak how close a guess was.
    const expected = Buffer.from(challenge.hash, 'hex');
    const actual = Buffer.from(this.hash(purpose, phoneE164, code), 'hex');
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
      await this.store.del(key); // a code works once
      return;
    }

    const attempts = challenge.attempts + 1;
    if (attempts >= OTP_MAX_ATTEMPTS) {
      await this.store.del(key);
      throw new AppError(429, 'OTP_TOO_MANY_ATTEMPTS', 'Too many wrong codes. Ask for a new one.');
    }
    await this.store.replace(key, JSON.stringify({ ...challenge, attempts }));
    throw new AppError(400, 'OTP_INVALID', 'That code is not right.', {
      attemptsLeft: OTP_MAX_ATTEMPTS - attempts,
    });
  }
}
