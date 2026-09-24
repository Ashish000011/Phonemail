import { z } from 'zod';
import { registrationChannelSchema } from './auth.js';

/** One row of the demo console's SMS/OTP feed. */
export const demoSmsSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  toE164: z.string(),
  body: z.string(),
  purpose: z.string(),
  provider: z.string(),
  status: z.string(),
  error: z.string().nullable(),
});
export type DemoSms = z.infer<typeof demoSmsSchema>;

/** One row of the demo console's users table. */
export const demoUserSchema = z.object({
  id: z.string(),
  phoneDisplay: z.string(),
  address: z.string(),
  registrationChannel: registrationChannelSchema,
  hasMobileSession: z.boolean(),
  /** The SMS rule: alerts only for users without an active mobile session. */
  getsSmsAlerts: z.boolean(),
  createdAt: z.string(),
});
export type DemoUser = z.infer<typeof demoUserSchema>;
