import type { KeyValueStore } from '../../src/lib/kv.js';

/**
 * In-memory KeyValueStore with a controllable clock, so tests can jump
 * forward in time ("5 minutes later…") without waiting.
 */
export class MemoryStore implements KeyValueStore {
  private data = new Map<string, { value: string; expiresAt: number }>();
  now = 1_000_000;

  advance(seconds: number) {
    this.now += seconds * 1000;
  }

  private live(key: string) {
    const entry = this.data.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now) {
      this.data.delete(key);
      return undefined;
    }
    return entry;
  }

  async get(key: string) {
    return this.live(key)?.value ?? null;
  }

  async set(key: string, value: string, ttlSeconds: number) {
    this.data.set(key, { value, expiresAt: this.now + ttlSeconds * 1000 });
  }

  async replace(key: string, value: string) {
    const entry = this.live(key);
    if (entry) entry.value = value;
  }

  async setIfAbsent(key: string, value: string, ttlSeconds: number) {
    if (this.live(key)) return false;
    await this.set(key, value, ttlSeconds);
    return true;
  }

  async increment(key: string, ttlSeconds: number) {
    const entry = this.live(key);
    if (!entry) {
      await this.set(key, '1', ttlSeconds);
      return 1;
    }
    entry.value = String(Number(entry.value) + 1);
    return Number(entry.value);
  }

  async ttl(key: string) {
    const entry = this.live(key);
    return entry ? Math.ceil((entry.expiresAt - this.now) / 1000) : 0;
  }

  async del(key: string) {
    this.data.delete(key);
  }
}
