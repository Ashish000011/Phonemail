import type { AuthEventType } from '@prisma/client';
import { db } from '../../lib/db.js';

export interface AuthEventInput {
  type: AuthEventType;
  userId?: string;
  phoneE164?: string;
  channel?: string;
  ip?: string;
  userAgent?: string;
}

/**
 * Writes one row of the audit trail. Auditing must never break sign-in, so a
 * failure here is logged to the console and swallowed.
 */
export async function recordAuthEvent(event: AuthEventInput): Promise<void> {
  try {
    await db.authEvent.create({ data: event });
  } catch (err) {
    console.error('could not record auth event', event.type, err);
  }
}
