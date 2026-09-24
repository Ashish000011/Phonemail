import type { User } from '@prisma/client';
import { env } from '../../config/env.js';
import { db } from '../../lib/db.js';
import { formatAddress } from '../addressing/index.js';
import { systemAddress } from './directory.js';
import { ingestMessage } from './ingest.js';
import { buildRawEmail } from './raw.js';

/**
 * Mail PhoneMail itself sends: the welcome email (so a new account's first
 * chat isn't empty) and "couldn't deliver" notices. It goes straight into the
 * ingest pipeline, exactly like any other email.
 */

function welcomeText(address: string): string {
  return [
    'Welcome to PhoneMail!',
    '',
    `Your email address is ${address}. Anyone can write to it from Gmail, Outlook or any other email app.`,
    '',
    'On your phone, emails show up as chats: everything from one person stays in one chat. Swipe right on an email to reply.',
    '',
    'Want a name-based address too? Add an alias like yourname@' +
      env.MAIL_DOMAIN +
      ' in Settings.',
    '',
    'The PhoneMail team',
  ].join('\n');
}

export async function sendWelcomeEmail(user: User): Promise<void> {
  const address = formatAddress(user.localPart, env.MAIL_DOMAIN);
  const from = systemAddress('welcome');
  const raw = await buildRawEmail({
    from: { name: 'PhoneMail', address: from },
    to: address,
    subject: 'Welcome to PhoneMail',
    text: welcomeText(address),
  });
  await ingestMessage({ raw, envelope: { mailFrom: from, rcptTo: [address] }, system: true });
}

/** Tells the sender, in a chat with mailer-daemon, which outside addresses didn't get their email. */
export async function sendDeliveryFailureNotice(input: {
  senderUserId: string;
  failedRecipients: string[];
  originalSubject: string;
}): Promise<void> {
  const sender = await db.user.findUnique({ where: { id: input.senderUserId } });
  if (!sender) return;
  const address = formatAddress(sender.localPart, env.MAIL_DOMAIN);
  const from = systemAddress('mailer-daemon');
  const subject = input.originalSubject || '(no subject)';
  const raw = await buildRawEmail({
    from: { name: 'Mail delivery', address: from },
    to: address,
    subject: `Couldn't deliver: ${subject}`,
    text: [
      `Couldn't deliver your email "${subject}" to ${input.failedRecipients.join(', ')}.`,
      '',
      "The receiving mail server didn't accept it after several tries. Check the address and send it again.",
    ].join('\n'),
  });
  await ingestMessage({ raw, envelope: { mailFrom: from, rcptTo: [address] }, system: true });
}
