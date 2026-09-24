import { env } from './config/env.js';
import { buildProviderSummary } from './config/providers.js';
import { redis } from './lib/redis.js';
import { RedisStore } from './lib/kv.js';
import { OtpService } from './modules/auth/otp.js';
import { SmsSender, createSmsProviders } from './providers/sms/index.js';
import { writeSmsLog } from './providers/sms/log.js';
import { createTwilioVerify } from './providers/otp/twilio-verify.js';
import { createOtpDelivery } from './providers/otp/index.js';
import { onAccountCreated } from './modules/accounts/service.js';
import { sendWelcomeEmail } from './modules/mail/system-mail.js';

/**
 * The long-lived helpers, built once per process from the environment.
 * Nothing here connects to anything until it's first used.
 */
export const kv = new RedisStore(redis);
export const otpService = new OtpService(kv, env.OTP_PEPPER, env.OTP_IP_LIMIT_PER_HOUR);
export const smsSender = new SmsSender(createSmsProviders(env), writeSmsLog, env.DEMO_MODE);
export const otpDelivery = createOtpDelivery({
  env,
  otp: otpService,
  sms: smsSender,
  writeSmsLog,
  twilioVerify: createTwilioVerify(env),
});

// Every new account gets a welcome email, so its first chat isn't empty.
onAccountCreated(sendWelcomeEmail);

/** otp, password or both, after the fallback rule (no way to send codes → password). */
export const authMode = buildProviderSummary(env).authMode;
