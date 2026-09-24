import { Queue, type JobsOptions } from 'bullmq';
import { createRedis } from './redis.js';

/** BullMQ queue names, one per kind of background work. */
export const QUEUES = {
  /** Housekeeping: trash purge, cleanup of unsent uploads. */
  maintenance: 'maintenance',
  /** Mail to other domains, handed to SMTP_RELAY (Mailpit in demo mode). */
  relay: 'relay',
  /** SMS alerts for new emails (Phase 3). */
  notifications: 'notifications',
  /** Replies to SMS and IVR sign-ups (Phase 6). */
  signup: 'signup',
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/** Retries with growing waits: 10 s, 20 s, 40 s… so a flaky provider gets time to recover. */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 10_000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

const queues = new Map<QueueName, Queue>();
let connection: ReturnType<typeof createRedis> | undefined;

/** One producer Queue per name, created on first use (api and smtp add jobs; worker runs them). */
export function getQueue(name: QueueName): Queue {
  let queue = queues.get(name);
  if (!queue) {
    connection ??= createRedis('queue-producer', { forQueue: true });
    queue = new Queue(name, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
    queues.set(name, queue);
  }
  return queue;
}

export async function closeQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((q) => q.close()));
  connection?.disconnect();
}
