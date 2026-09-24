import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import type { InfiniteData } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import {
  SOCKET_EVENTS,
  type ChatMessagesPage,
  type ConversationItem,
  type ConversationPage,
  type ConversationRemovedEvent,
  type ConversationUpdatedEvent,
  type MessageNewEvent,
  type MessageUpdatedEvent,
} from '@phonemail/shared';
import { getUserSocket } from '../shared/socket';
import { notifyIfHidden, useFirstArrival } from './home/NotificationCard';
import { playIncomingSound } from './sound';

/**
 * Live updates for the mobile client (docs/spec/05-conversations.md,
 * "Realtime"): Socket.IO events patch the cached lists, so screens change
 * without refetching. On reconnect, visible lists refetch once.
 */

// ---- screen-reader announcements ("New email from Arjun: Lunch?") ----

const useAnnouncements = create<{ message: string; announce: (m: string) => void }>((set) => ({
  message: '',
  announce: (message) => set({ message }),
}));

export const announce = (message: string) => useAnnouncements.getState().announce(message);

export function LiveRegion() {
  const message = useAnnouncements((s) => s.message);
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}

// ---- cache helpers ----

type ChatListCache = InfiniteData<ConversationPage, string | undefined>;
type MessagesCache = InfiniteData<ChatMessagesPage, string | undefined>;

/** Puts a chat at the top of the first page (removing its old position). */
function upsertOnTop(
  data: ChatListCache | undefined,
  item: ConversationItem,
): ChatListCache | undefined {
  if (!data) return data;
  const pages = data.pages.map((page) => ({
    ...page,
    items: page.items.filter((c) => c.id !== item.id),
  }));
  pages[0] = { ...pages[0], items: [item, ...pages[0].items] };
  return { ...data, pages };
}

function replaceInList(
  data: ChatListCache | undefined,
  item: ConversationItem,
): ChatListCache | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((c) => (c.id === item.id ? item : c)),
    })),
  };
}

function removeFromList(data: ChatListCache | undefined, id: string): ChatListCache | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((p) => ({ ...p, items: p.items.filter((c) => c.id !== id) })),
  };
}

/** New bubbles go at the end of the newest page (page 0 is the newest). */
export function appendMessage(
  data: MessagesCache | undefined,
  message: MessageNewEvent['message'],
): MessagesCache | undefined {
  if (!data) return data;
  const exists = data.pages.some((p) => p.items.some((m) => m.messageId === message.messageId));
  const pages = data.pages.map((page, i) => {
    if (exists) {
      return {
        ...page,
        items: page.items.map((m) => (m.messageId === message.messageId ? message : m)),
      };
    }
    return i === 0 ? { ...page, items: [...page.items, message] } : page;
  });
  return { ...data, pages };
}

function patchMessages(
  data: MessagesCache | undefined,
  event: MessageUpdatedEvent,
): MessagesCache | undefined {
  if (!data) return data;
  const ids = new Set(event.entryIds);
  const { trashed, isSpam, ...changes } = event.changes;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items
        .filter((m) => !(ids.has(m.entryId) && (trashed || isSpam)))
        .map((m) => (ids.has(m.entryId) ? { ...m, ...changes } : m)),
    })),
  };
}

// ---- the hook ----

export function useRealtime(enabled: boolean) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  useEffect(() => {
    if (!enabled) return;
    const socket = getUserSocket();

    const onNew = ({ conversation, message }: MessageNewEvent) => {
      queryClient.setQueryData<ChatListCache>(['conversations', 'all'], (d) =>
        upsertOnTop(d, conversation),
      );
      void queryClient.invalidateQueries({
        queryKey: ['conversations'],
        predicate: (q) => q.queryKey[1] !== 'all',
      });
      queryClient.setQueryData<MessagesCache>(['messages', conversation.id], (d) =>
        appendMessage(d, message),
      );
      if (message.direction === 'incoming') {
        const subject = message.subject || t('chat.noSubject');
        announce(t('home.newEmail', { name: message.from.name, subject }));
        useFirstArrival.getState().mark();
        notifyIfHidden(message.from.name, subject);
        playIncomingSound();
      }
    };
    const onUpdated = (event: MessageUpdatedEvent) => {
      queryClient.setQueriesData<MessagesCache>({ queryKey: ['messages'] }, (d) =>
        patchMessages(d, event),
      );
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    };
    const onConversation = ({ conversation }: ConversationUpdatedEvent) => {
      queryClient.setQueriesData<ChatListCache>({ queryKey: ['conversations'] }, (d) =>
        replaceInList(d, conversation),
      );
      queryClient.setQueryData(['conversation', conversation.id], conversation);
    };
    const onRemoved = ({ id }: ConversationRemovedEvent) => {
      queryClient.setQueriesData<ChatListCache>({ queryKey: ['conversations'] }, (d) =>
        removeFromList(d, id),
      );
    };
    // Missed events while offline: refetch what's on screen.
    const onReconnect = () => void queryClient.invalidateQueries();

    socket.on(SOCKET_EVENTS.messageNew, onNew);
    socket.on(SOCKET_EVENTS.messageUpdated, onUpdated);
    socket.on(SOCKET_EVENTS.conversationUpdated, onConversation);
    socket.on(SOCKET_EVENTS.conversationRemoved, onRemoved);
    socket.io.on('reconnect', onReconnect);
    return () => {
      socket.off(SOCKET_EVENTS.messageNew, onNew);
      socket.off(SOCKET_EVENTS.messageUpdated, onUpdated);
      socket.off(SOCKET_EVENTS.conversationUpdated, onConversation);
      socket.off(SOCKET_EVENTS.conversationRemoved, onRemoved);
      socket.io.off('reconnect', onReconnect);
    };
  }, [enabled, queryClient, t]);
}

/** "Waiting for network…" while the live connection is down. */
export function OfflineBanner() {
  const { t } = useTranslation();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const socket = getUserSocket();
    const up = () => setOnline(true);
    // Only show it after a short grace period, so page loads don't flash it.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const down = () => {
      timer = setTimeout(() => setOnline(false), 2500);
    };
    const connected = () => {
      clearTimeout(timer);
      up();
    };
    socket.on('connect', connected);
    socket.on('disconnect', down);
    socket.on('connect_error', down);
    return () => {
      clearTimeout(timer);
      socket.off('connect', connected);
      socket.off('disconnect', down);
      socket.off('connect_error', down);
    };
  }, []);

  if (online) return null;
  return (
    <div role="status" className="bg-[#fff4d6] px-4 py-2 text-center text-[0.8125rem] text-text">
      {t('home.offline')}
    </div>
  );
}
