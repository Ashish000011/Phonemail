import type { SmsProviderName } from '../../config/env.js';

export type SmsPurpose = 'otp' | 'notification' | 'signup_reply' | 'ivr_confirmation' | 'other';

export interface SmsSendResult {
  status: 'sent' | 'simulated';
  providerMessageId?: string;
  /** What actually went out (a Twilio trial sends its template, not our text). */
  sentBody: string;
}

/** Every SMS provider looks the same to the rest of the app (docs/spec/06). */
export interface SmsProvider {
  name: SmsProviderName;
  isConfigured(): boolean;
  /** false = can only send fixed templates (Twilio trial), so useless for codes. */
  supportsCustomText(): boolean;
  send(toE164: string, body: string, purpose: SmsPurpose): Promise<SmsSendResult>;
}

/** fetch, injectable so tests can fake the provider's HTTP API. */
export type FetchFn = typeof fetch;
