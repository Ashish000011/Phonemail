import { env } from '../../config/env.js';
import { db } from '../../lib/db.js';
import { getQueue, QUEUES } from '../../lib/queue.js';
import { smsSender, kv } from '../../services.js';
import { formatPhone } from '../addressing/index.js';
import { hasActiveMobileSession } from '../auth/sessions.js';
import { onEntryDelivered } from '../mail/ingest.js';
import { alertDecision } from './eligibility.js';
import { buildAlertText } from './text.js';

/**
 * SMS alerts (docs/spec/06, "SMS notification rule"):
 *   ingest ──▶ onEntryDelivered ──▶ queue "notifications" ──▶ worker ──▶ SMS chain ──▶ SmsLog
 * The worker re-checks the rule at send time, so a user who signed in on
 * mobile a second ago doesn't get a text.
 */

export interface AlertJob {
  entryId: string;
}

/** Call once per process that runs the ingest pipeline (api and smtp). */
export function registerAlertHook(): void {
  onEntryDelivered(async (entry) => {
    // Cheap checks here; the mobile-session check happens in the worker.
    const decision = alertDecision(entry, false);
    if (!decision.send) return;
    await getQueue(QUEUES.notifications).add('sms-alert', {
      entryId: entry.entryId,
    } satisfies AlertJob);
  });
}

export type AlertOutcome = { sent: true; provider: string } | { sent: false; reason: string };

/** How the recipient will recognize the sender: name and number, or the address. */
function senderLabel(message: {
  fromAddress: string;
  fromName: string | null;
  fromUser: { displayName: string | null; phoneE164: string } | null;
}): string {
  if (message.fromUser) {
    const number = formatPhone(message.fromUser.phoneE164);
    return message.fromUser.displayName ? `${message.fromUser.displayName} (${number})` : number;
  }
  return message.fromAddress;
}

export async function processAlert(job: AlertJob): Promise<AlertOutcome> {
  const entry = await db.mailboxEntry.findUnique({
    where: { id: job.entryId },
    include: {
      user: { select: { id: true, phoneE164: true } },
      message: {
        select: {
          subject: true,
          fromAddress: true,
          fromName: true,
          fromUserId: true,
          fromUser: { select: { displayName: true, phoneE164: true } },
        },
      },
    },
  });
  if (!entry) return { sent: false, reason: 'entry-gone' };
  if (entry.trashedAt || entry.isRead) return { sent: false, reason: 'already-handled' };

  const decision = alertDecision(
    {
      direction: entry.direction,
      isSpam: entry.isSpam,
      system: false,
      userId: entry.userId,
      senderUserId: entry.message.fromUserId,
    },
    await hasActiveMobileSession(entry.userId),
  );
  if (!decision.send) return { sent: false, reason: decision.reason };

  // Optional throttle per (user, sender), so a chatty sender can't flood someone's phone.
  if (env.SMS_NOTIFY_COOLDOWN_SECONDS > 0) {
    const key = `sms-cooldown:${entry.userId}:${entry.message.fromUserId ?? entry.message.fromAddress}`;
    if (!(await kv.setIfAbsent(key, '1', env.SMS_NOTIFY_COOLDOWN_SECONDS))) {
      return { sent: false, reason: 'cooldown' };
    }
  }

  const result = await smsSender.send({
    to: entry.user.phoneE164,
    body: buildAlertText(senderLabel(entry.message), entry.message.subject),
    purpose: 'notification',
    userId: entry.userId,
  });
  return { sent: true, provider: result.provider };
}
