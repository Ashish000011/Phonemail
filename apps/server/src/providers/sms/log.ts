import { db } from '../../lib/db.js';
import type { SmsLogWriter } from './index.js';

/** Every SMS attempt becomes a SmsLog row: an audit trail and the demo console's feed. */
export const writeSmsLog: SmsLogWriter = async (entry) => {
  await db.smsLog.create({ data: entry });
};
