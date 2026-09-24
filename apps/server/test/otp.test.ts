import { beforeEach, describe, expect, it } from 'vitest';
import {
  OTP_MAX_ATTEMPTS,
  OTP_MAX_PER_IP_PER_HOUR,
  OTP_MAX_PER_NUMBER_PER_HOUR,
  OtpService,
} from '../src/modules/auth/otp.js';
import { MemoryStore } from './helpers/memory-store.js';

const PHONE = '+919876543210';
const IP = '203.0.113.7';

let store: MemoryStore;
let otp: OtpService;

beforeEach(() => {
  store = new MemoryStore();
  otp = new OtpService(store, 'test-pepper-test-pepper');
});

/** Any 6-digit code that isn't the right one. */
function wrong(code: string) {
  return code === '000000' ? '111111' : '000000';
}

describe('issuing and verifying codes', () => {
  it('issues 6-digit codes', async () => {
    expect(await otp.issue(PHONE, 'login')).toMatch(/^\d{6}$/);
  });

  it('stores only a hash, never the code', async () => {
    const code = await otp.issue(PHONE, 'login');
    const stored = await store.get(`otp:login:${PHONE}`);
    expect(stored).not.toContain(code);
    expect(JSON.parse(stored!).hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('accepts the right code once', async () => {
    const code = await otp.issue(PHONE, 'login');
    await expect(otp.verify(PHONE, 'login', code)).resolves.toBeUndefined();
    await expect(otp.verify(PHONE, 'login', code)).rejects.toMatchObject({ code: 'OTP_EXPIRED' });
  });

  it('keeps purposes apart (a portal code is not a login code)', async () => {
    const code = await otp.issue(PHONE, 'register');
    await expect(otp.verify(PHONE, 'login', code)).rejects.toMatchObject({ code: 'OTP_EXPIRED' });
  });

  it('a new code replaces the old one', async () => {
    const first = await otp.issue(PHONE, 'login');
    const second = await otp.issue(PHONE, 'login');
    if (first !== second) {
      await expect(otp.verify(PHONE, 'login', first)).rejects.toMatchObject({
        code: 'OTP_INVALID',
      });
    }
    await expect(otp.verify(PHONE, 'login', second)).resolves.toBeUndefined();
  });

  it('expires after 5 minutes', async () => {
    const code = await otp.issue(PHONE, 'login');
    store.advance(5 * 60 + 1);
    await expect(otp.verify(PHONE, 'login', code)).rejects.toMatchObject({ code: 'OTP_EXPIRED' });
  });

  it('still works just before expiry', async () => {
    const code = await otp.issue(PHONE, 'login');
    store.advance(5 * 60 - 1);
    await expect(otp.verify(PHONE, 'login', code)).resolves.toBeUndefined();
  });
});

describe('wrong codes', () => {
  it('says how many attempts are left', async () => {
    const code = await otp.issue(PHONE, 'login');
    await expect(otp.verify(PHONE, 'login', wrong(code))).rejects.toMatchObject({
      code: 'OTP_INVALID',
      statusCode: 400,
      details: { attemptsLeft: OTP_MAX_ATTEMPTS - 1 },
    });
  });

  it('deletes the challenge after 5 wrong attempts, even if the right code comes next', async () => {
    const code = await otp.issue(PHONE, 'login');
    for (let i = 1; i < OTP_MAX_ATTEMPTS; i++) {
      await expect(otp.verify(PHONE, 'login', wrong(code))).rejects.toMatchObject({
        code: 'OTP_INVALID',
      });
    }
    await expect(otp.verify(PHONE, 'login', wrong(code))).rejects.toMatchObject({
      code: 'OTP_TOO_MANY_ATTEMPTS',
    });
    await expect(otp.verify(PHONE, 'login', code)).rejects.toMatchObject({ code: 'OTP_EXPIRED' });
  });

  it('a wrong attempt does not extend the expiry', async () => {
    const code = await otp.issue(PHONE, 'login');
    store.advance(4 * 60);
    await expect(otp.verify(PHONE, 'login', wrong(code))).rejects.toMatchObject({
      code: 'OTP_INVALID',
    });
    store.advance(61);
    await expect(otp.verify(PHONE, 'login', code)).rejects.toMatchObject({ code: 'OTP_EXPIRED' });
  });
});

describe('request limits', () => {
  it('enforces a 30-second resend cooldown with retryAfterSeconds', async () => {
    await otp.checkRequestLimits(PHONE, IP);
    store.advance(10);
    await expect(otp.checkRequestLimits(PHONE, IP)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      statusCode: 429,
      details: { retryAfterSeconds: 20 },
    });
    store.advance(21);
    await expect(otp.checkRequestLimits(PHONE, IP)).resolves.toBeUndefined();
  });

  it('allows 5 codes per number per hour', async () => {
    for (let i = 0; i < OTP_MAX_PER_NUMBER_PER_HOUR; i++) {
      await otp.checkRequestLimits(PHONE, IP);
      store.advance(31);
    }
    await expect(otp.checkRequestLimits(PHONE, IP)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
    store.advance(60 * 60);
    await expect(otp.checkRequestLimits(PHONE, IP)).resolves.toBeUndefined();
  });

  it('allows 20 requests per IP per hour across different numbers', async () => {
    for (let i = 0; i < OTP_MAX_PER_IP_PER_HOUR; i++) {
      await otp.checkRequestLimits(`+9198765432${String(i).padStart(2, '0')}`, IP);
    }
    await expect(otp.checkRequestLimits('+919999999999', IP)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
    await expect(otp.checkRequestLimits('+919999999999', '198.51.100.1')).resolves.toBeUndefined();
  });
});
