import { Prisma, PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

/**
 * One Prisma client per process. It connects lazily on the first query and
 * keeps a small connection pool to Postgres.
 */
export const db = new PrismaClient({ datasourceUrl: env.DATABASE_URL });

/** True when a create/update hit a unique constraint (e.g. two sign-ups racing). */
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}
