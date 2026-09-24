import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

/**
 * One Prisma client per process. It connects lazily on the first query and
 * keeps a small connection pool to Postgres.
 */
export const db = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
