import { z } from 'zod';
import { languageSchema } from './languages.js';

/** How users prove who they are (see docs/spec/03-auth-and-accounts.md). */
export const AUTH_MODES = ['otp', 'password', 'both'] as const;
export const authModeSchema = z.enum(AUTH_MODES);
export type AuthMode = z.infer<typeof authModeSchema>;

/**
 * Which route an OTP takes to the user:
 * - sms: our own code through an SMS provider that can send custom text
 * - twilio_verify: Twilio Verify creates, sends and checks the code
 * - console: demo mode, the code shows in the demo console and a UI banner
 * - none: no way to deliver codes, so sign-in falls back to passwords
 */
export const OTP_PATHS = ['sms', 'twilio_verify', 'console', 'none'] as const;
export const otpPathSchema = z.enum(OTP_PATHS);
export type OtpPath = z.infer<typeof otpPathSchema>;

/** The non-secret settings every UI needs. Served by GET /api/config. */
export const publicConfigSchema = z.object({
  authMode: authModeSchema,
  demoMode: z.boolean(),
  mailDomain: z.string(),
  languages: z.array(languageSchema),
  tosVersion: z.string(),
  otpPath: otpPathSchema,
  /** The project's GitHub page, when REPO_URL is set */
  repoUrl: z.string().nullable(),
});
export type PublicConfig = z.infer<typeof publicConfigSchema>;
