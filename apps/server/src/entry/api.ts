import { env } from '../config/env.js';
import { logProviderSummary } from '../config/providers.js';
import { createLogger } from '../lib/logger.js';
import { db } from '../lib/db.js';
import { redis } from '../lib/redis.js';
import { closeQueues } from '../lib/queue.js';
import { checkMigrations, checkPostgres, checkRedis } from '../lib/health.js';
import { buildApp } from '../app.js';
import { registerAlertHook } from '../modules/notifications/alerts.js';
import { attachRealtime } from '../modules/realtime/server.js';
import { onShutdown } from './shutdown.js';

// The REST API, Socket.IO for live updates, and (Phase 6) the webhooks.
const logger = createLogger('api');
logProviderSummary(logger, env);

// The api also ingests mail (welcome emails), so it queues SMS alerts too.
registerAlertHook();

const app = await buildApp({
  env,
  logger,
  checks: { postgres: checkPostgres, redis: checkRedis, migrations: checkMigrations },
});
const io = attachRealtime(app.server, logger);

onShutdown(logger, async () => {
  await io.close();
  await app.close();
  await closeQueues();
  await db.$disconnect();
  redis.disconnect();
});

await app.listen({ host: '0.0.0.0', port: env.PORT });
