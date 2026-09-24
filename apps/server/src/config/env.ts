import { z } from 'zod';
import { authModeSchema } from '@phonemail/shared';

/**
 * Every setting comes from environment variables, validated here once at
 * startup. Each one has a safe demo default, so `docker compose up -d` works
 * with no .env file (see docs/spec/01-architecture.md).
 */

/** Development-only secrets. Using them with DEMO_MODE=false logs a warning. */
export const DEV_SECRETS = {
  JWT_SECRET: 'dev-only-jwt-secret-change-me',
  OTP_PEPPER: 'dev-only-otp-pepper-change-me',
  INTERNAL_SMTP_SECRET: 'dev-only-smtp-secret-change-me',
  SMSGATE_WEBHOOK_SECRET: 'dev-only-smsgate-hook',
} as const;

export const SMS_PROVIDER_NAMES = ['smsgate', 'twilio', 'console'] as const;
export type SmsProviderName = (typeof SMS_PROVIDER_NAMES)[number];

/** Parses "true"/"false" (also 1/0, yes/no) into a boolean. */
const booleanFlag = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined) return defaultValue;
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes'].includes(normalized)) return true;
      if (['false', '0', 'no'].includes(normalized)) return false;
      ctx.addIssue({ code: 'custom', message: 'must be true or false' });
      return z.NEVER;
    });

/** "smsgate,twilio,console" → ['smsgate', 'twilio', 'console'] */
const providerList = z
  .string()
  .default('smsgate,twilio,console')
  .transform((value) =>
    value
      .split(',')
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean),
  )
  .pipe(z.array(z.enum(SMS_PROVIDER_NAMES)));

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  PORT: z.coerce.number().int().positive().default(3000),
  SMTP_PORT: z.coerce.number().int().positive().default(2525),
  DATA_DIR: z.string().default('./data'),

  MAIL_DOMAIN: z.string().default('phonemail.com'),
  PUBLIC_BASE_URL: z.url().default('http://localhost:8080'),
  DEMO_MODE: booleanFlag(true),
  AUTH_MODE: authModeSchema.default('otp'),
  DEFAULT_COUNTRY: z.string().length(2).toUpperCase().default('IN'),
  // Shown under Settings → Help → About (the project's GitHub page).
  REPO_URL: z.url().optional(),

  JWT_SECRET: z.string().min(16).default(DEV_SECRETS.JWT_SECRET),
  OTP_PEPPER: z.string().min(16).default(DEV_SECRETS.OTP_PEPPER),
  INTERNAL_SMTP_SECRET: z.string().min(16).default(DEV_SECRETS.INTERNAL_SMTP_SECRET),

  DATABASE_URL: z.string().default('postgresql://phonemail:phonemail@localhost:5432/phonemail'),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  SMS_PROVIDERS: providerList,
  OTP_PROVIDER: z.enum(['auto', 'local', 'twilio_verify']).default('auto'),
  SMS_NOTIFY_COOLDOWN_SECONDS: z.coerce.number().int().min(0).default(0),
  // Code requests allowed per IP address per hour. Everything from your own
  // laptop reaches Docker from one IP, so raise it while testing.
  OTP_IP_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(20),

  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  TWILIO_TRIAL: booleanFlag(true),
  TWILIO_SMS_TEMPLATE: z.string().default('sms_account_alerts'),
  TWILIO_VERIFY_SERVICE_SID: z.string().optional(),
  TWILIO_VOICE: z.string().default('Polly.Aditi'),

  SMSGATE_API_URL: z.url().default('https://api.sms-gate.app/3rdparty/v1'),
  SMSGATE_USERNAME: z.string().optional(),
  SMSGATE_PASSWORD: z.string().optional(),
  SMSGATE_WEBHOOK_SECRET: z.string().min(8).default(DEV_SECRETS.SMSGATE_WEBHOOK_SECRET),
  // Optional: the "signing key" from the SMSGate app; enables signature checks on its webhooks.
  SMSGATE_SIGNING_KEY: z.string().optional(),
  // Texts to the SMSGate phone must start with this word to sign up.
  // "*" accepts any text (only for a dedicated gateway phone).
  SMSGATE_SIGNUP_KEYWORD: z.string().default('JOIN'),

  // Where the api submits outgoing mail: our own SMTP server ("smtp" in Docker).
  SMTP_SUBMIT_HOST: z.string().default('localhost'),
  SMTP_RELAY_HOST: z.string().default('localhost'),
  SMTP_RELAY_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_RELAY_USER: z.string().optional(),
  SMTP_RELAY_PASS: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Docker Compose passes unset variables as empty strings (`${VAR:-}`).
 * Treat "" as "not set" so the defaults above apply.
 */
function dropEmptyValues(raw: NodeJS.ProcessEnv): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value !== undefined && value.trim() !== '') result[key] = value;
  }
  return result;
}

export function loadEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(dropEmptyValues(raw));
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${problems}`);
  }
  return parsed.data;
}

/** Warnings for development secrets used outside demo mode. */
export function secretWarnings(env: Env): string[] {
  if (env.DEMO_MODE) return [];
  return (Object.keys(DEV_SECRETS) as (keyof typeof DEV_SECRETS)[])
    .filter((key) => env[key] === DEV_SECRETS[key])
    .map((key) => `${key} uses the development default. Set a real secret for production.`);
}

/** The validated settings for this process. */
export const env: Env = loadEnv();
