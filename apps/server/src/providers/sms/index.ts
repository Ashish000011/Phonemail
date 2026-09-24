import type { Env, SmsProviderName } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { createConsoleSmsProvider } from './console.js';
import { createSmsGateProvider } from './smsgate.js';
import { createTwilioSmsProvider } from './twilio.js';
import type { SmsProvider, SmsPurpose } from './types.js';

export type { SmsProvider, SmsPurpose } from './types.js';

export interface SmsLogEntry {
  userId?: string;
  toE164: string;
  body: string;
  purpose: SmsPurpose;
  provider: string;
  status: 'sent' | 'failed' | 'simulated';
  providerMessageId?: string;
  error?: string;
}

/** Where every attempt is recorded (the SmsLog table in production). */
export type SmsLogWriter = (entry: SmsLogEntry) => Promise<void>;

export interface SendSmsInput {
  to: string;
  body: string;
  purpose: SmsPurpose;
  userId?: string;
}

export interface SendSmsResult {
  provider: SmsProviderName;
  status: 'sent' | 'simulated';
}

// "123456 is your PhoneMail code…" → "•••••• is your PhoneMail code…"
function maskCodes(body: string): string {
  return body.replace(/\b\d{6}\b/g, '••••••');
}

/**
 * Tries each configured provider in SMS_PROVIDERS order until one succeeds.
 * Every attempt, successful or not, is logged. OTP codes skip providers that
 * can only send templates. Outside demo mode, codes are masked in the log.
 */
export class SmsSender {
  constructor(
    private readonly providers: SmsProvider[],
    private readonly writeLog: SmsLogWriter,
    private readonly demoMode: boolean,
  ) {}

  /** Can any configured provider deliver this purpose? */
  canSend(purpose: SmsPurpose): boolean {
    return this.candidates(purpose).length > 0;
  }

  private candidates(purpose: SmsPurpose): SmsProvider[] {
    return this.providers.filter(
      (p) => p.isConfigured() && (purpose !== 'otp' || p.supportsCustomText()),
    );
  }

  async send({ to, body, purpose, userId }: SendSmsInput): Promise<SendSmsResult> {
    const logBody = (text: string) =>
      purpose === 'otp' && !this.demoMode ? maskCodes(text) : text;

    for (const provider of this.candidates(purpose)) {
      try {
        const result = await provider.send(to, body, purpose);
        await this.writeLog({
          userId,
          toE164: to,
          body: logBody(result.sentBody),
          purpose,
          provider: provider.name,
          status: result.status,
          providerMessageId: result.providerMessageId,
        });
        return { provider: provider.name, status: result.status };
      } catch (err) {
        await this.writeLog({
          userId,
          toE164: to,
          body: logBody(body),
          purpose,
          provider: provider.name,
          status: 'failed',
          error: err instanceof Error ? err.message.slice(0, 500) : String(err),
        });
        // fall through to the next provider
      }
    }
    throw new AppError(503, 'SMS_UNAVAILABLE', 'We could not send an SMS right now.');
  }
}

/** The providers in the configured order, each built from env. */
export function createSmsProviders(env: Env): SmsProvider[] {
  const factories: Record<SmsProviderName, () => SmsProvider> = {
    smsgate: () => createSmsGateProvider(env),
    twilio: () => createTwilioSmsProvider(env),
    console: () => createConsoleSmsProvider(env.DEMO_MODE),
  };
  return env.SMS_PROVIDERS.map((name) => factories[name]());
}
