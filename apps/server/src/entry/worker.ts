import { writeFileSync } from 'node:fs';
import { Worker, type Job } from 'bullmq';
import { env } from '../config/env.js';
import { logProviderSummary } from '../config/providers.js';
import { WORKER_HEARTBEAT_FILE } from '../config/constants.js';
import { createLogger } from '../lib/logger.js';
import { db } from '../lib/db.js';
import { redis, createRedis } from '../lib/redis.js';
import { closeQueues, getQueue, QUEUES } from '../lib/queue.js';
import { relayGaveUp, relayMessage, type RelayJob } from '../modules/mail/relay.js';
import { purgeOldTrash, purgeUnsentUploads } from '../modules/mailbox/service.js';
import { processAlert, type AlertJob } from '../modules/notifications/alerts.js';
import { onShutdown } from './shutdown.js';

// Background jobs (BullMQ): relaying mail to other domains, housekeeping, and
// (from Phase 3) SMS alerts. Each job retries with growing waits.
const logger = createLogger('worker');
logProviderSummary(logger, env);

const connection = createRedis('worker', { forQueue: true });
const HOUR = 60 * 60 * 1000;

const maintenance = new Worker(
  QUEUES.maintenance,
  async (job) => {
    switch (job.name) {
      case 'purge-trash':
        return { deleted: await purgeOldTrash() };
      case 'purge-uploads':
        return { deleted: await purgeUnsentUploads() };
      default:
        logger.warn({ job: job.name }, 'unknown maintenance job');
    }
  },
  { connection },
);

const relay = new Worker<RelayJob>(
  QUEUES.relay,
  async (job) => {
    await relayMessage(job.data);
    return { relayed: job.data.recipients.length };
  },
  { connection, concurrency: 5 },
);

// SMS alerts for people without the mobile app (the rule is re-checked here).
const alerts = new Worker<AlertJob>(QUEUES.notifications, (job) => processAlert(job.data), {
  connection,
  concurrency: 5,
});

// The same schedule is set on every start; upsert keeps just one copy of each.
await getQueue(QUEUES.maintenance).upsertJobScheduler(
  'purge-trash',
  { every: 24 * HOUR },
  { name: 'purge-trash' },
);
await getQueue(QUEUES.maintenance).upsertJobScheduler(
  'purge-uploads',
  { every: HOUR },
  { name: 'purge-uploads' },
);

for (const worker of [maintenance, relay, alerts]) {
  worker.on('ready', () => logger.info({ queue: worker.name }, 'worker ready'));
  worker.on('completed', (job: Job, result: unknown) =>
    logger.info({ queue: worker.name, job: job.name, id: job.id, result }, 'job done'),
  );
  worker.on('failed', (job, err) =>
    logger.warn(
      {
        queue: worker.name,
        job: job?.name,
        id: job?.id,
        attempt: job?.attemptsMade,
        err: err.message,
      },
      'job failed',
    ),
  );
}

// After the last retry, tell the sender their outside email didn't go through.
relay.on('failed', (job) => {
  if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return;
  relayGaveUp(job.data).catch((err) => logger.error({ err }, 'could not report relay failure'));
});

// The Docker healthcheck reads this file's age to know the worker is alive.
function heartbeat() {
  writeFileSync(WORKER_HEARTBEAT_FILE, String(Date.now()));
}
heartbeat();
const heartbeatTimer = setInterval(heartbeat, 10_000);

onShutdown(logger, async () => {
  clearInterval(heartbeatTimer);
  await Promise.all([maintenance.close(), relay.close(), alerts.close()]);
  await closeQueues();
  connection.disconnect();
  await db.$disconnect();
  redis.disconnect();
});
