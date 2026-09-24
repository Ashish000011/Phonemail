import type { SearchMessageHit, StartChat } from '@phonemail/shared';
import { env } from '../../config/env.js';
import { db } from '../../lib/db.js';
import {
  formatAddress,
  isValidEmail,
  parseAddress,
  tryNormalizePhone,
} from '../addressing/index.js';
import { resolveLocalAddress } from '../mail/directory.js';
import { nameFor } from './service.js';

/**
 * Search (docs/spec/04-mail-engine.md, "Search"): Postgres full-text search
 * over subject, body and sender, plus "Start a chat with …" when the text is
 * a phone number or an email address.
 */

// Markers Postgres puts around matched words; they can't appear in email text.
const START = '\u0001';
const STOP = '\u0002';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escape everything first, then turn only our markers into <mark>. Safe to render as HTML. */
export function highlightToHtml(headline: string): string {
  return escapeHtml(headline).replaceAll(START, '<mark>').replaceAll(STOP, '</mark>');
}

/** "lunch tom" → "lunch:* & tom:*": every word must match, as a prefix (search as you type). */
export function toPrefixQuery(q: string): string | null {
  const words =
    q
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.slice(0, 8) ?? [];
  return words.length ? words.map((w) => `${w}:*`).join(' & ') : null;
}

interface HitRow {
  entryId: string;
  messageId: string;
  conversationId: string;
  threadId: string;
  subject: string;
  fromName: string | null;
  fromAddress: string;
  fromUserId: string | null;
  sentAt: Date;
  highlight: string;
}

export async function searchMessages(userId: string, q: string): Promise<SearchMessageHit[]> {
  const tsquery = toPrefixQuery(q);
  if (!tsquery) return [];
  const like = `%${q
    .trim()
    .toLowerCase()
    .replace(/[%_\\]/g, '\\$&')}%`;
  const headlineOptions = `StartSel=${START}, StopSel=${STOP}, MaxWords=18, MinWords=6, MaxFragments=1`;

  // Tagged template: every ${value} becomes a query parameter, never SQL text.
  const rows = await db.$queryRaw<HitRow[]>`
    SELECT e.id AS "entryId", m.id AS "messageId", e."conversationId", m."threadId", m.subject,
           m."fromName", m."fromAddress", m."fromUserId", m."sentAt",
           ts_headline('simple', m."textBody", query, ${headlineOptions}) AS highlight
    FROM "MailboxEntry" e
    JOIN "Message" m ON m.id = e."messageId"
    CROSS JOIN to_tsquery('simple', ${tsquery}) AS query
    WHERE e."userId" = ${userId}::uuid
      AND e."trashedAt" IS NULL
      AND e."isSpam" = false
      AND (m."searchVector" @@ query OR lower(m."fromAddress") LIKE ${like})
    ORDER BY ts_rank(m."searchVector", query) DESC, m."sentAt" DESC
    LIMIT 40`;

  const senders = await db.user.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.fromUserId).filter(Boolean) as string[])] } },
    select: { id: true, displayName: true, phoneE164: true },
  });
  const senderById = new Map(senders.map((s) => [s.id, s]));

  // An email to yourself has two copies; list it once.
  const seen = new Set<string>();
  const unique = rows.filter((row) => {
    if (seen.has(row.messageId)) return false;
    seen.add(row.messageId);
    return true;
  });
  return unique.map((row) => ({
    entryId: row.entryId,
    messageId: row.messageId,
    conversationId: row.conversationId,
    threadId: row.threadId,
    subject: row.subject,
    from: {
      name: nameFor(
        row.fromUserId ? (senderById.get(row.fromUserId) ?? null) : null,
        row.fromName,
        row.fromAddress,
      ),
      address: row.fromAddress,
    },
    highlight: highlightToHtml(row.highlight),
    sentAt: row.sentAt.toISOString(),
  }));
}

/** "Start a chat with +91 98765 43210" when the search text is a number or an address. */
export async function startChatFor(q: string): Promise<StartChat | null> {
  const value = q.trim();
  let address: string | null = null;
  let phoneDisplay: string | null = null;

  if (/^[+\d\s().-]{6,}$/.test(value)) {
    const phone = tryNormalizePhone(value, env.DEFAULT_COUNTRY);
    if (phone) {
      address = formatAddress(phone.localPart, env.MAIL_DOMAIN);
      phoneDisplay = phone.display;
    }
  } else if (isValidEmail(value)) {
    address = value.toLowerCase();
  }
  if (!address) return null;

  const local = parseAddress(address, env.MAIL_DOMAIN)?.isLocal
    ? await resolveLocalAddress(address)
    : null;
  const user = local
    ? await db.user.findUnique({ where: { id: local.userId }, select: { displayName: true } })
    : null;
  return {
    address,
    displayName: user?.displayName ?? null,
    phoneDisplay,
    isPhoneMailUser: Boolean(local),
  };
}
