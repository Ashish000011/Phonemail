import { createHash, randomBytes } from 'node:crypto';
import type { User } from '@prisma/client';
import type Mail from 'nodemailer/lib/mailer/index.js';
import { env } from '../config/env.js';
import { db } from '../lib/db.js';
import { formatAddress } from '../modules/addressing/index.js';
import { systemAddress } from '../modules/mail/directory.js';
import { ingestMessage } from '../modules/mail/ingest.js';
import { buildRawEmail } from '../modules/mail/raw.js';
import { makePostcardPng, makeTicketPdf } from '../modules/demo/presets.js';

/**
 * Demo data (docs/spec/09-quality.md, "Seed data"), loaded once in demo mode:
 *   Priya 9000000001: has the mobile app, so she gets NO SMS alerts
 *   Arjun 9000000002: web only, so he DOES get SMS alerts; alias "arjun"
 *   Meera 9000000003: signed up by phone call (IVR)
 * The emails go through the real ingest pipeline ("quiet": no alerts or live
 * events), so chats, threads, replies and spam are exactly what real mail makes.
 */
const SEEDED_KEY = 'demo_seeded';
const DAY = 24 * 60 * 60 * 1000;

/** A time N days ago at hh:mm local server time. */
function daysAgo(days: number, hour: number, minute: number): Date {
  const date = new Date(Date.now() - days * DAY);
  date.setHours(hour, minute, 0, 0);
  // "Today 23:30" can't be in the future.
  return date.getTime() > Date.now() ? new Date(Date.now() - 60_000) : date;
}

async function upsertUser(
  phoneE164: string,
  localPart: string,
  displayName: string,
  about: string,
  registrationChannel: User['registrationChannel'],
): Promise<User> {
  return db.user.upsert({
    where: { phoneE164 },
    update: {},
    create: {
      phoneE164,
      localPart,
      displayName,
      about,
      registrationChannel,
      tosVersion: 'seed',
      tosAcceptedAt: new Date(Date.now() - 7 * DAY),
      createdAt: new Date(Date.now() - 7 * DAY),
    },
  });
}

export async function seedDemoData(log: (msg: string) => void): Promise<void> {
  if (await db.appMeta.findUnique({ where: { key: SEEDED_KEY } })) {
    log('demo data already present');
    return;
  }

  const priya = await upsertUser(
    '+919000000001',
    '9000000001',
    'Priya Sharma',
    'Product designer, Chennai',
    'mobile',
  );
  const arjun = await upsertUser(
    '+919000000002',
    '9000000002',
    'Arjun Kumar',
    'Weekend trekker',
    'web',
  );
  const meera = await upsertUser('+919000000003', '9000000003', 'Meera Iyer', 'Available', 'ivr');
  await db.alias.upsert({
    where: { localPart: 'arjun' },
    update: {},
    create: { userId: arjun.id, localPart: 'arjun' },
  });

  // Priya "has the app": an active mobile session. Its token is random and
  // thrown away, so nobody can use it; it only switches her SMS alerts off.
  await db.session.create({
    data: {
      userId: priya.id,
      clientType: 'mobile',
      refreshTokenHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
      userAgent: 'PhoneMail mobile (demo data)',
      expiresAt: new Date(Date.now() + 365 * DAY),
    },
  });

  const addr = (u: User) => formatAddress(u.localPart, env.MAIL_DOMAIN);
  const person = (u: User) => ({ name: u.displayName ?? '', address: addr(u) });

  /** Sends one email through the pipeline, as if at `when`. */
  async function mail(
    id: string,
    when: Date,
    from: User | { name: string; address: string },
    to: User[],
    options: Omit<Mail.Options, 'from' | 'to'> & { replyTo?: string; ccUsers?: User[] } = {},
  ): Promise<string> {
    const messageId = `<seed-${id}@${env.MAIL_DOMAIN}>`;
    const { replyTo, ccUsers = [], ...rest } = options;
    const sender = 'id' in from ? from : null;
    const fromHeader = 'id' in from ? person(from) : from;
    const raw = await buildRawEmail({
      ...rest,
      messageId,
      date: when,
      from: fromHeader,
      to: to.map(person),
      cc: ccUsers.map(person),
      inReplyTo: replyTo,
      references: replyTo ? [replyTo] : undefined,
    });
    await ingestMessage({
      raw,
      envelope: {
        mailFrom: fromHeader.address,
        rcptTo: [...to, ...ccUsers].map(addr),
      },
      senderUserId: sender?.id,
      receivedAt: when,
      quiet: true,
    });
    return messageId;
  }

  // Everyone's first chat: the welcome email.
  for (const user of [priya, arjun, meera]) {
    const raw = await buildRawEmail({
      messageId: `<seed-welcome-${user.localPart}@${env.MAIL_DOMAIN}>`,
      date: daysAgo(7, 9, 0),
      from: { name: 'PhoneMail', address: systemAddress('welcome') },
      to: addr(user),
      subject: 'Welcome to PhoneMail',
      text: `Welcome to PhoneMail!\n\nYour email address is ${addr(user)}. Anyone can write to it from any email app.\n\nOn your phone, emails show up as chats. Swipe right on an email to reply.\n\nThe PhoneMail team`,
    });
    await ingestMessage({
      raw,
      envelope: { mailFrom: systemAddress('welcome'), rcptTo: [addr(user)] },
      system: true,
      receivedAt: daysAgo(7, 9, 0),
      quiet: true,
    });
  }

  // Priya ↔ Arjun: a trek plan, with replies (Priya's first email is "Replied").
  const trek = await mail('trek', daysAgo(6, 10, 5), arjun, [priya], {
    subject: 'Weekend trek?',
    text: 'Hey Priya! A few of us are planning the Yelagiri trek on Saturday. You in?',
  });
  const trekReply = await mail('trek-reply', daysAgo(6, 10, 40), priya, [arjun], {
    subject: 'Re: Weekend trek?',
    text: 'Count me in! What time are we leaving?',
    replyTo: trek,
  });
  await mail('trek-reply-2', daysAgo(5, 18, 20), arjun, [priya], {
    subject: 'Re: Weekend trek?',
    text: '6 AM from Chennai Central. Bring water and snacks, it gets hot by noon.',
    replyTo: trekReply,
  });

  // A group chat (Priya, Arjun, Meera) with an image and a PDF.
  const tickets = await mail('tickets', daysAgo(4, 9, 0), meera, [priya, arjun], {
    subject: 'Train tickets for Saturday',
    text: 'Booked all three of us. Tickets attached, plus a photo from our last trip!',
    attachments: [
      { filename: 'last-trip.png', content: makePostcardPng(), contentType: 'image/png' },
      { filename: 'tickets.pdf', content: makeTicketPdf(), contentType: 'application/pdf' },
    ],
  });
  await mail('tickets-reply', daysAgo(4, 9, 30), arjun, [meera], {
    ccUsers: [priya],
    subject: 'Re: Train tickets for Saturday',
    text: "You're a star, Meera! 🙌",
    replyTo: tickets,
  });

  // An outside newsletter with a long email (clamped with "Read more").
  await mail(
    'digest',
    daysAgo(3, 16, 45),
    { name: 'Weekly Reads', address: 'newsletter@example.com' },
    [priya],
    {
      subject: 'Your weekly reading list',
      text: [
        'Here is your weekly reading list.',
        'Email is older than the web: the first message between two computers went out in 1971, and the "@" sign was chosen because it never appears in a name.',
        'Fifty years later, email still carries the messages that matter: tickets, receipts, school notices and letters from people we love. What changed is how we read it. Most of our day is spent in chat apps, with one thread per person and quick replies.',
        'PhoneMail meets you there. Your phone number is your address and your inbox looks like your chats. Long emails like this one are clamped in the chat; tap "Read more" to open the full view.',
        'Three tips: swipe right on an email to reply; each email can be answered once, which keeps chats tidy. Tap an email to read it with its original formatting. Add an alias in Settings for a name-based address.',
        'Next week: why remote images stay blocked until you tap "Show images", and how that stops tracking pixels.',
        'Happy reading!',
      ].join('\n\n'),
    },
  );

  // Priya ↔ Meera: a work thread.
  const review = await mail('review', daysAgo(2, 11, 15), priya, [meera], {
    subject: 'Design review notes',
    text: "Hi Meera, sharing my notes from today's review:\n\n1. The onboarding flow tested well.\n2. People missed the search bar on small screens.\n3. Let's try a bolder compose button.",
  });
  await mail('review-reply', daysAgo(2, 13, 2), meera, [priya], {
    subject: 'Re: Design review notes',
    text: "Thanks Priya! I'll update the mockups by Friday.",
    replyTo: review,
  });

  // Spam for Priya (an unknown outside sender with a scam phrase).
  await mail(
    'spam',
    daysAgo(1, 20, 10),
    { name: 'Prize Desk', address: 'winner@prizes-example.net' },
    [priya],
    {
      subject: 'YOU HAVE WON A PRIZE',
      text: 'Congratulations! You have won the lottery. Claim your prize now: http://prizes-example.net/claim',
    },
  );

  // Something new for today.
  await mail('movie', daysAgo(0, 8, 30), arjun, [priya], {
    subject: 'Movie tonight?',
    text: 'The new Mani Ratnam film is on at 7. Want to go?',
  });
  await mail('lunch', daysAgo(0, 9, 10), arjun, [meera], {
    subject: 'Lunch on Thursday?',
    text: 'Are you free for lunch on Thursday? The new dosa place near the office.',
  });

  // Read state: older mail is read; today's is new. Priya starred the tickets.
  await db.mailboxEntry.updateMany({
    where: { direction: 'incoming', createdAt: { lt: daysAgo(0, 0, 0) } },
    data: { isRead: true },
  });
  const ticketsMessage = await db.message.findUnique({ where: { messageIdHeader: tickets } });
  if (ticketsMessage) {
    await db.mailboxEntry.updateMany({
      where: { userId: priya.id, messageId: ticketsMessage.id },
      data: { isStarred: true },
    });
  }

  // A draft in Priya's Drafts.
  await db.draft.create({
    data: {
      userId: priya.id,
      to: [addr(arjun), addr(meera)],
      subject: 'Trip budget',
      body: 'Train: ₹450 each\nFood: about ₹600 each\nEntry tickets: ₹100 each',
    },
  });

  await db.appMeta.create({ data: { key: SEEDED_KEY, value: new Date().toISOString() } });
  log('demo data loaded: Priya (mobile app), Arjun (web, alias arjun), Meera (IVR)');
}
