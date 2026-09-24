import type { OtpPath } from '@phonemail/shared';
import type { Env } from '../../config/env.js';
import { resolveOtpPath } from '../../config/providers.js';
import { AppError } from '../../lib/errors.js';
import type { OtpPurpose, OtpService } from '../../modules/auth/otp.js';
import type { SmsLogWriter, SmsSender } from '../sms/index.js';
import { buildOtpSms } from './text.js';
import type { TwilioVerify } from './twilio-verify.js';

/**
 * Sends and checks codes along the path chosen at startup
 * (docs/spec/03-auth-and-accounts.md, "Which OTP path is used"):
 * - sms / console: we make the code (OtpService) and the SMS chain delivers it
 * - twilio_verify: Twilio makes, sends and checks the code
 * - none: codes can't be delivered; the app runs in password mode
 */
export interface OtpDelivery {
  path: OtpPath;
  /** Returns the code only when the demo console "delivered" it (demo mode). */
  send(phoneE164: string, purpose: OtpPurpose, userId?: string): Promise<{ demoCode?: string }>;
  check(phoneE164: string, purpose: OtpPurpose, code: string): Promise<void>;
}

interface Deps {
  env: Env;
  otp: OtpService;
  sms: SmsSender;
  writeSmsLog: SmsLogWriter;
  twilioVerify: TwilioVerify;
}

export function createOtpDelivery({ env, otp, sms, writeSmsLog, twilioVerify }: Deps): OtpDelivery {
  const path = resolveOtpPath(env).path;

  if (path === 'twilio_verify') {
    return {
      path,
      async send(phoneE164, _purpose, userId) {
        await twilioVerify.start(phoneE164);
        // Twilio sends this SMS itself; log it so the demo console shows it happened.
        await writeSmsLog({
          userId,
          toE164: phoneE164,
          body: '(code sent by Twilio Verify)',
          purpose: 'otp',
          provider: 'twilio_verify',
          status: 'sent',
        });
        return {};
      },
      check: (phoneE164, _purpose, code) => twilioVerify.check(phoneE164, code),
    };
  }

  if (path === 'none') {
    const unavailable = () => {
      throw new AppError(503, 'OTP_UNAVAILABLE', 'Codes are switched off. Use your password.');
    };
    return { path, send: async () => unavailable(), check: async () => unavailable() };
  }

  return {
    path,
    async send(phoneE164, purpose, userId) {
      const code = await otp.issue(phoneE164, purpose);
      const result = await sms.send({
        to: phoneE164,
        body: buildOtpSms(code, env.PUBLIC_BASE_URL),
        purpose: 'otp',
        userId,
      });
      // Only a simulated (demo console) delivery may hand the code back to the UI.
      return result.provider === 'console' && env.DEMO_MODE ? { demoCode: code } : {};
    },
    check: (phoneE164, purpose, code) => otp.verify(phoneE164, purpose, code),
  };
}
