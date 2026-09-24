import { z } from 'zod';

/**
 * Stable error codes. The API always answers errors as
 * { error: { code, message, details? } } and the UIs translate the code.
 */
export const ERROR_CODES = [
  // generic
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CSRF_HEADER_MISSING',
  'RATE_LIMITED',
  'INTERNAL',
  // phone numbers and accounts
  'INVALID_PHONE',
  'ALREADY_REGISTERED',
  // one-time codes
  'OTP_EXPIRED',
  'OTP_INVALID',
  'OTP_TOO_MANY_ATTEMPTS',
  'OTP_UNAVAILABLE',
  'SMS_UNAVAILABLE',
  // passwords and sessions
  'PASSWORD_LOGIN_DISABLED',
  'PASSWORD_TOO_SHORT',
  'PASSWORD_WRONG',
  'PASSWORD_NOT_SET',
  'SESSION_EXPIRED',
  'SESSION_REVOKED',
  'REFRESH_RACE',
  // aliases
  'ALIAS_INVALID',
  'ALIAS_RESERVED',
  'ALIAS_TAKEN',
  'ALIAS_HELD',
  'ALIAS_LIMIT',
  // files
  'FILE_INVALID',
  'FILE_TOO_LARGE',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
