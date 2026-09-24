import { redis } from './redis.js';

/**
 * Something happened that screens should reflect right away (a new email, a
 * read receipt, a chat moved to trash). Published on the Redis "events"
 * channel; the api forwards each event to the user's Socket.IO room (Phase 3).
 * Using Redis means smtp and worker, which have no sockets, can notify too.
 */
export const EVENTS_CHANNEL = 'events';

export interface AppEvent {
  /** Who should hear about it (empty for demo-console events) */
  userIds: string[];
  type: string;
  payload: Record<string, unknown>;
}

export async function publishEvent(event: AppEvent): Promise<void> {
  try {
    await redis.publish(EVENTS_CHANNEL, JSON.stringify(event));
  } catch (err) {
    // A missed live update is fixed by the next refresh; it must never fail a send.
    console.error('could not publish event', event.type, err);
  }
}
