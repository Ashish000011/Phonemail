import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SOCKET_EVENTS, type MessageNewEvent } from '@phonemail/shared';
import { getUserSocket } from '../shared/socket';
import { notifyIfHidden } from '../mobile/home/NotificationCard';
import { useWeb } from './store';

/** Everything a live event can change in the web client. */
const LIVE_KEYS = [['mailbox'], ['mailbox-counts'], ['thread'], ['drafts'], ['conversations']];

/**
 * Live updates for the web client. The same Socket.IO events as the phone,
 * but a Gmail list is paged and grouped by thread, so instead of patching it
 * we refetch what's visible; a new email also gets a brief highlight.
 */
export function useWebRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getUserSocket();
    const refresh = () => {
      for (const queryKey of LIVE_KEYS) void queryClient.invalidateQueries({ queryKey });
    };
    const onNew = ({ message }: MessageNewEvent) => {
      refresh();
      if (message.direction === 'incoming') {
        useWeb.getState().markFresh(message.messageId);
        notifyIfHidden(message.from.name, message.subject);
      }
    };
    socket.on(SOCKET_EVENTS.messageNew, onNew);
    socket.on(SOCKET_EVENTS.messageUpdated, refresh);
    socket.on(SOCKET_EVENTS.conversationUpdated, refresh);
    socket.on(SOCKET_EVENTS.conversationRemoved, refresh);
    socket.io.on('reconnect', refresh);
    return () => {
      socket.off(SOCKET_EVENTS.messageNew, onNew);
      socket.off(SOCKET_EVENTS.messageUpdated, refresh);
      socket.off(SOCKET_EVENTS.conversationUpdated, refresh);
      socket.off(SOCKET_EVENTS.conversationRemoved, refresh);
      socket.io.off('reconnect', refresh);
    };
  }, [queryClient]);
}
