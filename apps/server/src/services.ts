import { env } from './config/env.js';
import { buildProviderSummary } from './config/providers.js';
import { redis } from './lib/redis.js';
import { RedisStore } from './lib/kv.js';
import { OtpService } from './modules/auth/otp.js';
import { SmsSender, createSmsProviders } from './providers/sms/index.js';
import { writeSmsLog } from './providers/sms/log.js';
import { createTwilioVerify } from './providers/otp/twilio-verify.js';
import { createOtpDelivery } from './providers/otp/index.js';

/**
 * The long-lived helpers, built once per process from the environment.
 * Nothing here connects to anything until it's first used.
 */
export const kv = new RedisStore(redis);
export const otpService = new OtpService(kv, env.OTP_PEPPER);
export const smsSender = new SmsSender(createSmsProviders(env), writeSmsLog, env.DEMO_MODE);
export const otpDelivery = createOtpDelivery({
  env,
  otp: otpService,
  sms: smsSender,
  writeSmsLog,
  twilioVerify: createTwilioVerify(env),
});

/** otp, password or both, after the fallback rule (no way to send codes → password). */
export const authMode = buildProviderSummary(env).authMode;
