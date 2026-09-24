import { db } from './db.js';
import { redis } from './redis.js';

/** Rejects if the promise takes longer than `ms`, so a hung dependency can't hang the health check. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

export async function checkPostgres(): Promise<boolean> {
  try {
    await withTimeout(db.$queryRaw`SELECT 1`, 2000);
    return true;
  } catch {
    return false;
  }
}

export async function checkRedis(): Promise<boolean> {
  try {
    return (await withTimeout(redis.ping(), 2000)) === 'PONG';
  } catch {
    return false;
  }
}

/** True once `migrate` has run: the first migration's table exists and answers. */
export async function checkMigrations(): Promise<boolean> {
  try {
    await withTimeout(db.appMeta.count(), 2000);
    return true;
  } catch {
    return false;
  }
}
