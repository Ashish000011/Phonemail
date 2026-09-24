import type { Redis } from 'ioredis';

/**
 * The handful of Redis operations OTP codes and rate limits need, behind a
 * small interface so the rules can be unit-tested with an in-memory version.
 */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Changes the value but keeps the key's current expiry. No-op if the key is gone. */
  replace(key: string, value: string): Promise<void>;
  /** Sets only if the key doesn't exist yet. Returns true if it was set. */
  setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  /** Adds 1; the first increment starts the expiry window. Returns the new count. */
  increment(key: string, ttlSeconds: number): Promise<number>;
  /** Seconds until the key expires (0 if it doesn't exist). */
  ttl(key: string): Promise<number>;
  del(key: string): Promise<void>;
}

export class RedisStore implements KeyValueStore {
  constructor(private readonly redis: Redis) {}

  async get(key: string) {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number) {
    await this.redis.set(key, value, 'EX', ttlSeconds);
  }

  async replace(key: string, value: string) {
    await this.redis.set(key, value, 'KEEPTTL', 'XX');
  }

  async setIfAbsent(key: string, value: string, ttlSeconds: number) {
    return (await this.redis.set(key, value, 'EX', ttlSeconds, 'NX')) === 'OK';
  }

  async increment(key: string, ttlSeconds: number) {
    // One round trip: count up, and start the window only on the first hit (EXPIRE NX).
    const results = await this.redis.multi().incr(key).expire(key, ttlSeconds, 'NX').exec();
    return Number(results?.[0]?.[1] ?? 0);
  }

  async ttl(key: string) {
    return Math.max(0, await this.redis.ttl(key));
  }

  async del(key: string) {
    await this.redis.del(key);
  }
}
