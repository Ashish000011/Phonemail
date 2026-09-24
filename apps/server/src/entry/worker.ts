import { writeFileSync } from 'node:fs';
import { Worker } from 'bullmq';
import { env } from '../config/env.js';
import { logProviderSummary } from '../config/providers.js';
import { WORKER_HEARTBEAT_FILE } from '../config/constants.js';
import { createLogger } from '../lib/logger.js';
import { createRedis } from '../lib/redis.js';
import { QUEUES } from '../lib/queue.js';
import { onShutdown } from './shutdown.js';

// Background jobs (BullMQ). Later phases add SMS notifications, the outbound
// relay and signup replies; Phase 0 only runs the maintenance queue.
const logger = createLogger('worker');
logProviderSummary(logger, env);

const connection = createRedis('worker', { forQueue: true });

const maintenance = new Worker(
  QUEUES.maintenance,
  async (job) => {
    logger.info({ job: job.name, id: job.id }, 'maintenance job');
  },
  { connection },
);

maintenance.on('failed', (job, err) => logger.error({ job: job?.name, err }, 'job failed'));
maintenance.on('ready', () => logger.info({ queue: QUEUES.maintenance }, 'worker ready'));

// The Docker healthcheck reads this file's age to know the worker is alive.
function heartbeat() {
  writeFileSync(WORKER_HEARTBEAT_FILE, String(Date.now()));
}
heartbeat();
const heartbeatTimer = setInterval(heartbeat, 10_000);

onShutdown(logger, async () => {
  clearInterval(heartbeatTimer);
  await maintenance.close();
  connection.disconnect();
});
