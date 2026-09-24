import { env } from '../config/env.js';
import { logProviderSummary } from '../config/providers.js';
import { createLogger } from '../lib/logger.js';
import { db } from '../lib/db.js';
import { redis } from '../lib/redis.js';
import { checkMigrations, checkPostgres, checkRedis } from '../lib/health.js';
import { buildApp } from '../app.js';
import { onShutdown } from './shutdown.js';

// The REST API (and, from Phase 3, Socket.IO and the webhooks).
const logger = createLogger('api');
logProviderSummary(logger, env);

const app = await buildApp({
  env,
  logger,
  checks: { postgres: checkPostgres, redis: checkRedis, migrations: checkMigrations },
});

onShutdown(logger, async () => {
  await app.close();
  await db.$disconnect();
  redis.disconnect();
});

await app.listen({ host: '0.0.0.0', port: env.PORT });
