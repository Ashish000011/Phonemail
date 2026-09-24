import { Redis } from 'ioredis';
import { env } from '../config/env.js';

/**
 * Redis holds OTP challenges, rate-limit counters, BullMQ queues and the
 * realtime event channel.
 *
 * BullMQ workers need `maxRetriesPerRequest: null` (they block on Redis on
 * purpose), so they get their own connection from `createRedis({ forQueue: true })`.
 */
export function createRedis(name: string, options: { forQueue?: boolean } = {}): Redis {
  return new Redis(env.REDIS_URL, {
    connectionName: `phonemail-${name}`,
    lazyConnect: !options.forQueue,
    maxRetriesPerRequest: options.forQueue ? null : 3,
  });
}

/** Shared connection for normal commands. */
export const redis = createRedis('main');
