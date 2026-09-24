import { z } from 'zod';
import { languageSchema } from './languages.js';

/** Which app a session belongs to. mobile/apk sessions switch SMS alerts off. */
export const CLIENT_TYPES = ['mobile', 'web', 'apk'] as const;
export const clientTypeSchema = z.enum(CLIENT_TYPES);
export type ClientType = z.infer<typeof clientTypeSchema>;

export const REGISTRATION_CHANNELS = ['ivr', 'sms', 'portal', 'web', 'mobile'] as const;
export const registrationChannelSchema = z.enum(REGISTRATION_CHANNELS);
export type RegistrationChannel = z.infer<typeof registrationChannelSchema>;

export const MIN_PASSWORD_LENGTH = 8;

/** Raw phone input; the server normalizes it ("98765 43210", "+91…", "0…"). */
export const phoneInputSchema = z.string().trim().min(3).max(32);
export const otpCodeSchema = z.string().regex(/^\d{6}$/, 'The code has 6 digits');
export const newPasswordSchema = z.string().min(MIN_PASSWORD_LENGTH).max(200);

// ---- sign-in (web and mobile) ------------------------------------------------

export const otpRequestBodySchema = z.object({ phone: phoneInputSchema });

export const otpRequestResponseSchema = z.object({
  phoneE164: z.string(),
  resendAfterSeconds: z.number(),
  /** Only in demo mode, when the code went to the demo console instead of a phone. */
  demoCode: z.string().optional(),
});
export type OtpRequestResponse = z.infer<typeof otpRequestResponseSchema>;

export const otpVerifyBodySchema = z.object({
  phone: phoneInputSchema,
  code: otpCodeSchema,
  client: clientTypeSchema,
  tosVersion: z.string().max(40).optional(),
});

export const passwordLoginBodySchema = z.object({
  phone: phoneInputSchema,
  password: z.string().min(1).max(200),
  client: clientTypeSchema,
  tosVersion: z.string().max(40).optional(),
});

export const passwordChangeBodySchema = z.object({
  currentPassword: z.string().max(200).optional(),
  newPassword: newPasswordSchema,
});

// ---- the signed-in user --------------------------------------------------------

export const meSchema = z.object({
  id: z.string(),
  phoneE164: z.string(),
  /** +91 98765 43210 */
  phoneDisplay: z.string(),
  /** 9876543210@phonemail.com */
  address: z.string(),
  displayName: z.string().nullable(),
  about: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  language: languageSchema,
  readReceipts: z.boolean(),
  loadRemoteImages: z.boolean(),
  defaultSendAsAliasId: z.string().nullable(),
  mustChangePassword: z.boolean(),
  hasPassword: z.boolean(),
  registrationChannel: registrationChannelSchema,
  createdAt: z.string(),
});
export type Me = z.infer<typeof meSchema>;

export const authResultSchema = z.object({ user: meSchema, created: z.boolean() });
export type AuthResult = z.infer<typeof authResultSchema>;

export const updateMeBodySchema = z.object({
  displayName: z.string().trim().max(60).nullable().optional(),
  about: z.string().trim().max(140).nullable().optional(),
  language: languageSchema.optional(),
  readReceipts: z.boolean().optional(),
  loadRemoteImages: z.boolean().optional(),
  defaultSendAsAliasId: z.string().uuid().nullable().optional(),
});
export type UpdateMeBody = z.infer<typeof updateMeBodySchema>;

export const sessionInfoSchema = z.object({
  id: z.string(),
  clientType: clientTypeSchema,
  userAgent: z.string().nullable(),
  lastSeenAt: z.string(),
  createdAt: z.string(),
  current: z.boolean(),
});
export type SessionInfo = z.infer<typeof sessionInfoSchema>;

// ---- aliases ---------------------------------------------------------------------

export const aliasSchema = z.object({
  id: z.string(),
  localPart: z.string(),
  address: z.string(),
  isDefault: z.boolean(),
  createdAt: z.string(),
});
export type Alias = z.infer<typeof aliasSchema>;

export const aliasCheckResponseSchema = z.object({
  available: z.boolean(),
  /** An error code (ALIAS_INVALID, ALIAS_RESERVED, ALIAS_TAKEN, ALIAS_HELD, ALIAS_LIMIT) */
  reason: z.string().optional(),
});
export type AliasCheckResponse = z.infer<typeof aliasCheckResponseSchema>;

export const createAliasBodySchema = z.object({ localPart: z.string().trim().min(1).max(64) });

// ---- registration portal ---------------------------------------------------------

export const portalOtpRequestBodySchema = z.object({ phone: phoneInputSchema });

/** OTP mode sends a code; password mode sends a password. Never both. */
export const portalRegisterBodySchema = z.union([
  z.object({ phone: phoneInputSchema, code: otpCodeSchema }),
  z.object({ phone: phoneInputSchema, password: newPasswordSchema }),
]);

export const portalRegisterResponseSchema = z.object({ address: z.string() });
export type PortalRegisterResponse = z.infer<typeof portalRegisterResponseSchema>;
