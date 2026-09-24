import { env } from '../../config/env.js';
import { db } from '../../lib/db.js';
import { publishEvent } from '../../lib/events.js';
import type { SmsLogWriter } from './index.js';

/** Every SMS attempt becomes a SmsLog row: an audit trail and the demo console's feed. */
export const writeSmsLog: SmsLogWriter = async (entry) => {
  const row = await db.smsLog.create({ data: entry });
  if (env.DEMO_MODE) {
    await publishEvent({
      userIds: [],
      type: 'demo.sms',
      payload: {
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        toE164: row.toE164,
        body: row.body,
        purpose: row.purpose,
        provider: row.provider,
        status: row.status,
        error: row.error,
      },
    });
  }
};

/** Tells the demo console to refresh its users table (new account, mobile sign-in or out). */
export async function announceUsersChanged(): Promise<void> {
  if (env.DEMO_MODE) await publishEvent({ userIds: [], type: 'demo.users', payload: {} });
}
