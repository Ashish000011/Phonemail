import type { AuthMode, OtpPath } from '@phonemail/shared';
import type { Env, SmsProviderName } from './env.js';
import { secretWarnings } from './env.js';

/**
 * Works out, from the environment alone, which SMS providers are usable,
 * which way OTP codes travel and which sign-in mode results.
 * The real provider adapters (Phase 1) use the same answers.
 */

export interface SmsProviderStatus {
  name: SmsProviderName;
  configured: boolean;
  /** false when the provider can only send fixed templates (Twilio trial). */
  customText: boolean;
}

export function smsProviderStatuses(env: Env): SmsProviderStatus[] {
  return env.SMS_PROVIDERS.map((name) => {
    switch (name) {
      case 'smsgate':
        return {
          name,
          configured: Boolean(env.SMSGATE_USERNAME && env.SMSGATE_PASSWORD),
          customText: true,
        };
      case 'twilio':
        return {
          name,
          configured: Boolean(
            env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_PHONE_NUMBER,
          ),
          // A Twilio trial only lets us send one of its templates.
          customText: !env.TWILIO_TRIAL,
        };
      case 'console':
        // The console provider only exists in demo mode.
        return { name, configured: env.DEMO_MODE, customText: true };
    }
  });
}

export function activeSmsProviders(env: Env): SmsProviderStatus[] {
  return smsProviderStatuses(env).filter((provider) => provider.configured);
}

/** A real SMS provider (not the demo console) that can carry our own code text. */
function hasRealCustomTextProvider(env: Env): boolean {
  return activeSmsProviders(env).some((p) => p.customText && p.name !== 'console');
}

function hasTwilioVerify(env: Env): boolean {
  return Boolean(env.TWILIO_VERIFY_SERVICE_SID && env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN);
}

/** The order from docs/spec/03-auth-and-accounts.md, "Which OTP path is used". */
function autoOtpPath(env: Env): OtpPath {
  if (hasRealCustomTextProvider(env)) return 'sms';
  if (hasTwilioVerify(env)) return 'twilio_verify';
  if (env.DEMO_MODE) return 'console';
  return 'none';
}

export function resolveOtpPath(env: Env): { path: OtpPath; warnings: string[] } {
  if (env.OTP_PROVIDER === 'twilio_verify') {
    if (hasTwilioVerify(env)) return { path: 'twilio_verify', warnings: [] };
    return {
      path: autoOtpPath(env),
      warnings: ['OTP_PROVIDER=twilio_verify but Twilio Verify is not configured; using auto.'],
    };
  }
  if (env.OTP_PROVIDER === 'local') {
    if (hasRealCustomTextProvider(env)) return { path: 'sms', warnings: [] };
    return { path: env.DEMO_MODE ? 'console' : 'none', warnings: [] };
  }
  return { path: autoOtpPath(env), warnings: [] };
}

/** With no way to deliver codes, sign-in falls back to passwords. */
export function resolveAuthMode(
  env: Env,
  otpPath: OtpPath,
): { mode: AuthMode; warnings: string[] } {
  if (otpPath === 'none' && env.AUTH_MODE !== 'password') {
    return {
      mode: 'password',
      warnings: ['No way to deliver OTP codes, so AUTH_MODE falls back to password.'],
    };
  }
  return { mode: env.AUTH_MODE, warnings: [] };
}

export interface ProviderSummary {
  demoMode: boolean;
  smsProviders: { name: SmsProviderName; customText: boolean }[];
  otpPath: OtpPath;
  authMode: AuthMode;
  warnings: string[];
}

export function buildProviderSummary(env: Env): ProviderSummary {
  const otp = resolveOtpPath(env);
  const auth = resolveAuthMode(env, otp.path);
  return {
    demoMode: env.DEMO_MODE,
    smsProviders: activeSmsProviders(env).map(({ name, customText }) => ({ name, customText })),
    otpPath: otp.path,
    authMode: auth.mode,
    warnings: [...otp.warnings, ...auth.warnings, ...secretWarnings(env)],
  };
}

interface MinimalLogger {
  info(obj: object, msg: string): void;
  warn(msg: string): void;
}

/** Every entrypoint logs this at startup so the active setup is obvious. */
export function logProviderSummary(logger: MinimalLogger, env: Env): ProviderSummary {
  const summary = buildProviderSummary(env);
  logger.info(
    {
      demoMode: summary.demoMode,
      smsProviders: summary.smsProviders,
      otpPath: summary.otpPath,
      authMode: summary.authMode,
      mailDomain: env.MAIL_DOMAIN,
      publicBaseUrl: env.PUBLIC_BASE_URL,
    },
    'provider summary',
  );
  for (const warning of summary.warnings) logger.warn(warning);
  return summary;
}
