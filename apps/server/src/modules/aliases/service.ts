import type { Alias } from '@prisma/client';
import { db, isUniqueViolation } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { ALIAS_HOLD_DAYS, MAX_ALIASES_PER_USER, checkAliasFormat } from '../addressing/index.js';

export type AliasUnavailableReason =
  'ALIAS_INVALID' | 'ALIAS_RESERVED' | 'ALIAS_TAKEN' | 'ALIAS_HELD' | 'ALIAS_LIMIT';

export type AliasAvailability =
  | { available: true; localPart: string; existing: Alias | null }
  | { available: false; reason: AliasUnavailableReason };

const HOLD_MS = ALIAS_HOLD_DAYS * 24 * 60 * 60 * 1000;

/**
 * Can this user take this alias? Format and reserved words first, then the
 * database: someone else's alias, a recently deleted one (30-day hold, so
 * nobody catches mail meant for the old owner), or the user's limit of 5.
 */
export async function checkAliasAvailability(
  userId: string,
  input: string,
): Promise<AliasAvailability> {
  const format = checkAliasFormat(input);
  if (!format.ok) return { available: false, reason: format.reason };

  const existing = await db.alias.findUnique({ where: { localPart: format.localPart } });
  if (existing) {
    if (!existing.deletedAt) return { available: false, reason: 'ALIAS_TAKEN' };
    const holdOver = existing.deletedAt.getTime() + HOLD_MS < Date.now();
    // Your own deleted alias can come back; someone else's is held for 30 days.
    if (existing.userId !== userId && !holdOver) return { available: false, reason: 'ALIAS_HELD' };
  }

  const count = await db.alias.count({ where: { userId, deletedAt: null } });
  if (count >= MAX_ALIASES_PER_USER) return { available: false, reason: 'ALIAS_LIMIT' };

  return { available: true, localPart: format.localPart, existing };
}

const REASON_STATUS: Record<AliasUnavailableReason, number> = {
  ALIAS_INVALID: 400,
  ALIAS_RESERVED: 400,
  ALIAS_TAKEN: 409,
  ALIAS_HELD: 409,
  ALIAS_LIMIT: 409,
};

const REASON_MESSAGE: Record<AliasUnavailableReason, string> = {
  ALIAS_INVALID: 'Use 3–30 letters, digits, dots, dashes or underscores, starting with a letter.',
  ALIAS_RESERVED: 'That name is reserved.',
  ALIAS_TAKEN: 'That name is taken.',
  ALIAS_HELD: 'That name was recently used by someone else. Try another.',
  ALIAS_LIMIT: `You can have up to ${MAX_ALIASES_PER_USER} aliases.`,
};

export async function createAlias(userId: string, input: string): Promise<Alias> {
  const check = await checkAliasAvailability(userId, input);
  if (!check.available) {
    throw new AppError(REASON_STATUS[check.reason], check.reason, REASON_MESSAGE[check.reason]);
  }
  try {
    return await db.$transaction(async (tx) => {
      if (check.existing) {
        // Your own deleted alias: bring it back. Someone else's expired one: free the name.
        if (check.existing.userId === userId) {
          return tx.alias.update({ where: { id: check.existing.id }, data: { deletedAt: null } });
        }
        await tx.alias.delete({ where: { id: check.existing.id } });
      }
      return tx.alias.create({ data: { userId, localPart: check.localPart } });
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(409, 'ALIAS_TAKEN', REASON_MESSAGE.ALIAS_TAKEN);
    }
    throw err;
  }
}

/** Soft delete: the row stays (deletedAt set) to enforce the 30-day hold. */
export async function deleteAlias(userId: string, aliasId: string): Promise<void> {
  const alias = await db.alias.findFirst({ where: { id: aliasId, userId, deletedAt: null } });
  if (!alias) throw new AppError(404, 'NOT_FOUND', 'Not found.');
  await db.$transaction([
    db.alias.update({ where: { id: alias.id }, data: { deletedAt: new Date() } }),
    // If it was the default "send as" address, fall back to the primary.
    db.user.updateMany({
      where: { id: userId, defaultSendAsAliasId: alias.id },
      data: { defaultSendAsAliasId: null },
    }),
  ]);
}

export async function listAliases(userId: string): Promise<Alias[]> {
  return db.alias.findMany({ where: { userId, deletedAt: null }, orderBy: { createdAt: 'asc' } });
}
