import type { Env } from '../../config/env.js';
import { twilioConfigured, twilioPost } from '../twilio-client.js';
import type { FetchFn, SmsProvider } from './types.js';

/**
 * Twilio SMS. On a trial account Twilio only accepts one of its templates as
 * the body, so we send TWILIO_SMS_TEMPLATE instead of our text (the
 * organizers accept this) and report customText = false, which keeps OTP
 * codes off this provider.
 */
export function createTwilioSmsProvider(env: Env, fetchImpl: FetchFn = fetch): SmsProvider {
  return {
    name: 'twilio',
    isConfigured: () => twilioConfigured(env),
    supportsCustomText: () => !env.TWILIO_TRIAL,
    async send(toE164, body) {
      const sentBody = env.TWILIO_TRIAL ? env.TWILIO_SMS_TEMPLATE : body;
      const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
      const data = await twilioPost(
        env,
        url,
        { To: toE164, From: env.TWILIO_PHONE_NUMBER ?? '', Body: sentBody },
        fetchImpl,
      );
      return { status: 'sent', providerMessageId: String(data.sid ?? ''), sentBody };
    },
  };
}
