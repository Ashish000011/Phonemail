import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.js';
import {
  activeSmsProviders,
  buildProviderSummary,
  resolveAuthMode,
  resolveOtpPath,
} from '../src/config/providers.js';

const twilio = {
  TWILIO_ACCOUNT_SID: 'AC123',
  TWILIO_AUTH_TOKEN: 'token',
  TWILIO_PHONE_NUMBER: '+15550001111',
};
const smsgate = { SMSGATE_USERNAME: 'user', SMSGATE_PASSWORD: 'pass' };
const verify = { ...twilio, TWILIO_VERIFY_SERVICE_SID: 'VA123' };

describe('activeSmsProviders', () => {
  it('only the console is active with no credentials in demo mode', () => {
    expect(activeSmsProviders(loadEnv({})).map((p) => p.name)).toEqual(['console']);
  });

  it('keeps the SMS_PROVIDERS order and skips unconfigured providers', () => {
    const env = loadEnv({ ...twilio, ...smsgate, SMS_PROVIDERS: 'twilio,smsgate,console' });
    expect(activeSmsProviders(env).map((p) => p.name)).toEqual(['twilio', 'smsgate', 'console']);
  });

  it('a Twilio trial cannot send custom text', () => {
    const [provider] = activeSmsProviders(loadEnv({ ...twilio, DEMO_MODE: 'false' }));
    expect(provider).toEqual({ name: 'twilio', configured: true, customText: false });
  });
});

describe('resolveOtpPath (OTP_PROVIDER=auto)', () => {
  const cases: [string, Record<string, string>, string][] = [
    ['demo mode, nothing configured: console', {}, 'console'],
    ['SMSGate configured: our own codes by SMS', smsgate, 'sms'],
    ['Twilio trial only: still console (templates only)', twilio, 'console'],
    ['Twilio paid: our own codes by SMS', { ...twilio, TWILIO_TRIAL: 'false' }, 'sms'],
    ['Twilio Verify configured: twilio_verify', verify, 'twilio_verify'],
    ['SMSGate beats Twilio Verify', { ...verify, ...smsgate }, 'sms'],
    ['nothing and not demo: none', { DEMO_MODE: 'false' }, 'none'],
  ];
  it.each(cases)('%s', (_name, vars, expected) => {
    expect(resolveOtpPath(loadEnv(vars)).path).toBe(expected);
  });
});

describe('resolveOtpPath (forced)', () => {
  it('local uses the console in demo mode', () => {
    expect(resolveOtpPath(loadEnv({ OTP_PROVIDER: 'local', ...verify })).path).toBe('console');
  });

  it('twilio_verify without configuration falls back to auto with a warning', () => {
    const result = resolveOtpPath(loadEnv({ OTP_PROVIDER: 'twilio_verify' }));
    expect(result.path).toBe('console');
    expect(result.warnings).toHaveLength(1);
  });
});

describe('resolveAuthMode', () => {
  it('keeps the configured mode when codes can be delivered', () => {
    expect(resolveAuthMode(loadEnv({ AUTH_MODE: 'both' }), 'console').mode).toBe('both');
  });

  it('falls back to password when codes cannot be delivered', () => {
    const result = resolveAuthMode(loadEnv({}), 'none');
    expect(result.mode).toBe('password');
    expect(result.warnings).toHaveLength(1);
  });
});

describe('buildProviderSummary', () => {
  it('summarises a zero-credential demo setup', () => {
    expect(buildProviderSummary(loadEnv({}))).toEqual({
      demoMode: true,
      smsProviders: [{ name: 'console', customText: true }],
      otpPath: 'console',
      authMode: 'otp',
      warnings: [],
    });
  });
});
