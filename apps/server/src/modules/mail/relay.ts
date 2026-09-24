import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';
import { db } from '../../lib/db.js';
import { publishEvent } from '../../lib/events.js';
import { sendDeliveryFailureNotice } from './system-mail.js';

/**
 * Mail to other domains (gmail.com, …) leaves through SMTP_RELAY. In demo
 * mode that's Mailpit, so judges can see outgoing mail at
 * http://localhost:8025 and nothing actually leaves the laptop.
 */
export interface RelayJob {
  messageId: string;
  rawPath: string;
  mailFrom: string;
  recipients: string[];
  senderUserId: string;
}

export async function relayMessage(job: RelayJob): Promise<void> {
  const transport = nodemailer.createTransport({
    host: env.SMTP_RELAY_HOST,
    port: env.SMTP_RELAY_PORT,
    secure: env.SMTP_RELAY_PORT === 465,
    auth: env.SMTP_RELAY_USER
      ? { user: env.SMTP_RELAY_USER, pass: env.SMTP_RELAY_PASS }
      : undefined,
  });
  try {
    // The stored email is sent byte for byte; only the envelope says where it goes.
    await transport.sendMail({
      envelope: { from: job.mailFrom, to: job.recipients },
      raw: { path: job.rawPath },
    });
  } finally {
    transport.close();
  }
}

/** After the last retry: a red "failed" mark on the sender's copy and a notice in their chats. */
export async function relayGaveUp(job: RelayJob): Promise<void> {
  const entries = await db.mailboxEntry.findMany({
    where: { userId: job.senderUserId, messageId: job.messageId, direction: 'outgoing' },
    select: { id: true },
  });
  await db.mailboxEntry.updateMany({
    where: { id: { in: entries.map((e) => e.id) } },
    data: { deliveryState: 'failed' },
  });
  await publishEvent({
    userIds: [job.senderUserId],
    type: 'entries.updated',
    payload: { entryIds: entries.map((e) => e.id), changes: { deliveryState: 'failed' } },
  });
  const message = await db.message.findUnique({
    where: { id: job.messageId },
    select: { subject: true },
  });
  await sendDeliveryFailureNotice({
    senderUserId: job.senderUserId,
    failedRecipients: job.recipients,
    originalSubject: message?.subject ?? '',
  });
}
