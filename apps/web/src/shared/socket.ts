import { io, type Socket } from 'socket.io-client';

/**
 * Live updates from the server (docs/spec/05-conversations.md, "Realtime").
 * Same origin as the page, so the sign-in cookie travels with the handshake.
 * Event names and payload types live in @phonemail/shared (SOCKET_EVENTS).
 */
let userSocket: Socket | null = null;

export function getUserSocket(): Socket {
  userSocket ??= io({ path: '/socket.io', withCredentials: true });
  return userSocket;
}

/** After signing in or out, reconnect so the server sees the new cookie. */
export function reconnectUserSocket(): void {
  userSocket?.disconnect().connect();
}

/** The demo console isn't signed in; it listens to the demo room only. */
export function createDemoSocket(): Socket {
  return io({ path: '/socket.io', query: { demo: '1' } });
}
