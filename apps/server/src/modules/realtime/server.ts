import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { SOCKET_EVENTS } from '@phonemail/shared';
import { env } from '../../config/env.js';
import { EVENTS_CHANNEL, type AppEvent } from '../../lib/events.js';
import type { Logger } from '../../lib/logger.js';
import { createRedis } from '../../lib/redis.js';
import { ACCESS_COOKIE } from '../auth/cookies.js';
import { loadActiveSession } from '../auth/sessions.js';
import { verifyAccessToken } from '../auth/tokens.js';
import { chatMessageForEntry, getConversationItem } from '../conversations/service.js';

/**
 * Live updates (docs/spec/05-conversations.md, "Realtime").
 *
 *   smtp/worker/api ──publish──▶ Redis "events" ──▶ this subscriber ──▶ room user:<id>
 *
 * Any process can announce something; only the api holds the sockets.
 * Each signed-in socket joins its own room, so events reach only their owner.
 */

function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

export function attachRealtime(httpServer: HttpServer, logger: Logger): Server {
  const io = new Server(httpServer, {
    path: '/socket.io',
    serveClient: false,
    // Same origin through nginx; no cross-site sockets.
    cors: { origin: false },
  });

  // Sign-in check on connect, with the same cookie the REST API uses.
  io.use(async (socket, next) => {
    const token = readCookie(socket.handshake.headers.cookie, ACCESS_COOKIE);
    const claims = token ? await verifyAccessToken(token) : null;
    if (claims && (await loadActiveSession(claims.sessionId, claims.userId))) {
      socket.data.userId = claims.userId;
      return next();
    }
    // The demo console isn't signed in; it may listen to the demo room only.
    if (env.DEMO_MODE && socket.handshake.query.demo === '1') {
      socket.data.demo = true;
      return next();
    }
    next(new Error('UNAUTHORIZED'));
  });

  io.on('connection', (socket) => {
    if (socket.data.userId) void socket.join(`user:${socket.data.userId}`);
    if (socket.data.demo) void socket.join('demo');
  });

  const subscriber = createRedis('realtime-subscriber', { forQueue: true });
  void subscriber.subscribe(EVENTS_CHANNEL);
  subscriber.on('message', (_channel, raw) => {
    let event: AppEvent;
    try {
      event = JSON.parse(raw) as AppEvent;
    } catch {
      return;
    }
    forward(io, event).catch((err) =>
      logger.error({ err, type: event.type }, 'realtime forward failed'),
    );
  });

  io.engine.on('close', () => subscriber.disconnect());
  return io;
}

/** Turns an internal event into what the apps expect, per user. */
async function forward(io: Server, event: AppEvent): Promise<void> {
  const payload = event.payload;
  for (const userId of event.userIds) {
    const room = io.to(`user:${userId}`);
    switch (event.type) {
      case 'mail.delivered': {
        if (payload.isSpam) break;
        const conversationId = String(payload.conversationId);
        const [conversation, message] = await Promise.all([
          getConversationItem(userId, conversationId),
          chatMessageForEntry(userId, String(payload.entryId)),
        ]);
        if (message) room.emit(SOCKET_EVENTS.messageNew, { conversation, message });
        break;
      }
      case 'entries.updated':
        room.emit(SOCKET_EVENTS.messageUpdated, payload);
        break;
      case 'conversation.updated':
        room.emit(SOCKET_EVENTS.conversationUpdated, {
          conversation: await getConversationItem(userId, String(payload.conversationId)),
        });
        break;
      case 'conversation.removed':
        room.emit(SOCKET_EVENTS.conversationRemoved, { id: payload.conversationId });
        break;
    }
  }
  // Demo console feed (demo mode only; no user ids needed).
  if (event.type === 'demo.sms') io.to('demo').emit(SOCKET_EVENTS.demoSms, payload);
  if (event.type === 'demo.users') io.to('demo').emit(SOCKET_EVENTS.demoUsers, payload);
}
