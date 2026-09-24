import { describe, expect, it } from 'vitest';
import { DEV_SECRETS, loadEnv, secretWarnings } from '../src/config/env.js';

describe('loadEnv', () => {
  it('works with no variables at all (fresh clone, no .env)', () => {
    const env = loadEnv({});
    expect(env.MAIL_DOMAIN).toBe('phonemail.com');
    expect(env.DEMO_MODE).toBe(true);
    expect(env.AUTH_MODE).toBe('otp');
    expect(env.SMS_PROVIDERS).toEqual(['smsgate', 'twilio', 'console']);
    expect(env.TWILIO_TRIAL).toBe(true);
    expect(env.SMSGATE_SIGNUP_KEYWORD).toBe('JOIN');
  });

  it('treats empty strings from docker compose as unset', () => {
    const env = loadEnv({ MAIL_DOMAIN: '', PORT: '', TWILIO_ACCOUNT_SID: '' });
    expect(env.MAIL_DOMAIN).toBe('phonemail.com');
    expect(env.PORT).toBe(3000);
    expect(env.TWILIO_ACCOUNT_SID).toBeUndefined();
  });

  it('parses booleans and provider lists', () => {
    const env = loadEnv({
      DEMO_MODE: 'false',
      TWILIO_TRIAL: '0',
      SMS_PROVIDERS: 'twilio, console',
    });
    expect(env.DEMO_MODE).toBe(false);
    expect(env.TWILIO_TRIAL).toBe(false);
    expect(env.SMS_PROVIDERS).toEqual(['twilio', 'console']);
  });

  it('rejects invalid values with a readable message', () => {
    expect(() => loadEnv({ DEMO_MODE: 'maybe' })).toThrow(/DEMO_MODE/);
    expect(() => loadEnv({ AUTH_MODE: 'magic' })).toThrow(/AUTH_MODE/);
    expect(() => loadEnv({ SMS_PROVIDERS: 'pigeon' })).toThrow(/SMS_PROVIDERS/);
  });
});

describe('secretWarnings', () => {
  it('stays quiet in demo mode', () => {
    expect(secretWarnings(loadEnv({}))).toEqual([]);
  });

  it('warns about every development secret outside demo mode', () => {
    const warnings = secretWarnings(loadEnv({ DEMO_MODE: 'false' }));
    expect(warnings).toHaveLength(Object.keys(DEV_SECRETS).length);
    expect(warnings[0]).toMatch(/JWT_SECRET/);
  });

  it('does not warn about secrets that were changed', () => {
    const warnings = secretWarnings(
      loadEnv({ DEMO_MODE: 'false', JWT_SECRET: 'a-real-secret-that-is-long-enough' }),
    );
    expect(warnings.some((w) => w.includes('JWT_SECRET'))).toBe(false);
  });
});
