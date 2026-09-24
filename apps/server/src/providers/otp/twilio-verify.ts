import type { Env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { twilioPost } from '../twilio-client.js';
import type { FetchFn } from '../sms/types.js';

/**
 * Twilio Verify creates, sends and checks the code itself (trial: verified
 * numbers only, 40 free checks). Used only when no provider can send our own text.
 */
export function createTwilioVerify(env: Env, fetchImpl: FetchFn = fetch) {
  const base = `https://verify.twilio.com/v2/Services/${env.TWILIO_VERIFY_SERVICE_SID}`;

  return {
    async start(phoneE164: string): Promise<void> {
      await twilioPost(env, `${base}/Verifications`, { To: phoneE164, Channel: 'sms' }, fetchImpl);
    },

    async check(phoneE164: string, code: string): Promise<void> {
      try {
        const data = await twilioPost(
          env,
          `${base}/VerificationCheck`,
          { To: phoneE164, Code: code },
          fetchImpl,
        );
        if (data.status !== 'approved') {
          throw new AppError(400, 'OTP_INVALID', 'That code is not right.');
        }
      } catch (err) {
        if (err instanceof AppError) throw err;
        // Twilio answers 404 once a verification has expired or been used.
        if ((err as { status?: number }).status === 404) {
          throw new AppError(400, 'OTP_EXPIRED', 'The code has expired. Ask for a new one.');
        }
        throw err;
      }
    },
  };
}

export type TwilioVerify = ReturnType<typeof createTwilioVerify>;
