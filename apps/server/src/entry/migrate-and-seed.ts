import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { env } from '../config/env.js';
import { createLogger } from '../lib/logger.js';
import { db } from '../lib/db.js';

// One-shot container: apply database migrations, then (demo mode only) load
// seed data. Safe to run on every `docker compose up`: both steps are idempotent.
const logger = createLogger('migrate');

/** Finds node_modules/prisma/build/index.js by walking up from this folder. */
function findPrismaCli(): string {
  let dir = process.cwd();
  for (;;) {
    const candidate = join(dir, 'node_modules', 'prisma', 'build', 'index.js');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) throw new Error('Prisma CLI not found in node_modules');
    dir = parent;
  }
}

function migrate() {
  logger.info('applying migrations');
  const result = spawnSync(process.execPath, [findPrismaCli(), 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) throw new Error(`prisma migrate deploy failed (exit ${result.status})`);
}

async function seed() {
  if (!env.DEMO_MODE) {
    logger.info('demo mode off, skipping seed');
    return;
  }
  // Demo users and chats arrive with Phase 3; for now just record when we ran.
  await db.appMeta.upsert({
    where: { key: 'last_migrate_run' },
    create: { key: 'last_migrate_run', value: new Date().toISOString() },
    update: { value: new Date().toISOString() },
  });
  logger.info('seed done');
}

try {
  migrate();
  await seed();
  await db.$disconnect();
  logger.info('migrate-and-seed finished');
} catch (err) {
  logger.error({ err }, 'migrate-and-seed failed');
  await db.$disconnect();
  process.exit(1);
}
