import { env } from '../../config/env.js';
import { db } from '../../lib/db.js';
import { formatAddress, parseAddress } from '../addressing/index.js';

/**
 * Who owns an address on our domain: a user's primary local part
 * (9876543210), one of their aliases (arjun), or a system sender.
 */

/** System senders that belong to nobody: they send welcome mail and bounce notices. */
export const SYSTEM_LOCAL_PARTS = new Set(['welcome', 'mailer-daemon']);

export function systemAddress(localPart: 'welcome' | 'mailer-daemon'): string {
  return formatAddress(localPart, env.MAIL_DOMAIN);
}

/** One query for many local parts: localPart → userId. Deleted aliases don't count. */
export async function lookupLocalParts(localParts: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(localParts.map((p) => p.toLowerCase()))];
  if (unique.length === 0) return new Map();
  const [users, aliases] = await Promise.all([
    db.user.findMany({
      where: { localPart: { in: unique } },
      select: { id: true, localPart: true },
    }),
    db.alias.findMany({
      where: { localPart: { in: unique }, deletedAt: null },
      select: { userId: true, localPart: true },
    }),
  ]);
  const map = new Map<string, string>();
  for (const u of users) map.set(u.localPart, u.id);
  for (const a of aliases) map.set(a.localPart, a.userId);
  return map;
}

export interface LocalRecipient {
  userId: string;
  localPart: string;
  plusTag?: string;
}

/** The PhoneMail user behind an address on our domain, or null. */
export async function resolveLocalAddress(address: string): Promise<LocalRecipient | null> {
  const parsed = parseAddress(address, env.MAIL_DOMAIN);
  if (!parsed?.isLocal) return null;
  const userId = (await lookupLocalParts([parsed.localPart])).get(parsed.localPart);
  return userId ? { userId, localPart: parsed.localPart, plusTag: parsed.plusTag } : null;
}

/** Every address a user may send from: the primary and live aliases. */
export async function ownedLocalParts(userId: string): Promise<Set<string>> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      localPart: true,
      aliases: { where: { deletedAt: null }, select: { localPart: true } },
    },
  });
  return new Set([user.localPart, ...user.aliases.map((a) => a.localPart)]);
}
