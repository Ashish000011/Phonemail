import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronsDown } from 'lucide-react';
import {
  chatMessagesPageSchema,
  conversationItemSchema,
  sendMessageResponseSchema,
  type ChatMessage,
  type ChatMessagesPage,
  type ConversationItem,
  type Me,
} from '@phonemail/shared';
import { api } from '../../shared/api';
import { useErrorText } from '../../shared/errors';
import { useDocumentTitle } from '../../shared/useDocumentTitle';
import { daySeparator, sameDay } from '../../shared/time';
import { RequireUser } from '../MobileShell';
import { OfflineBanner } from '../live';
import { Avatar } from '../ui/Avatar';
import { IconButton } from '../ui/IconButton';
import { OverflowMenu } from '../ui/OverflowMenu';
import { SkeletonRows } from '../ui/bits';
import { toast } from '../ui/toast';
import { Bubble } from './Bubble';
import { ChatInput, type OutgoingEmail } from './ChatInput';
import { MessageActions } from './MessageActions';
import { WALLPAPER_URL } from './wallpaper';

type MessagesCache = InfiniteData<ChatMessagesPage, string | undefined>;

/** Consecutive emails of the same calendar day, for the date labels. */
function groupByDay(messages: ChatMessage[]) {
  const days: { key: string; sentAt: string; messages: ChatMessage[] }[] = [];
  for (const message of messages) {
    const last = days[days.length - 1];
    if (last && sameDay(last.sentAt, message.sentAt)) last.messages.push(message);
    else days.push({ key: message.entryId, sentAt: message.sentAt, messages: [message] });
  }
  return days;
}

/** Ids for bubbles shown before the server has answered ("temp-1", "temp-2", …). */
let tempCounter = 0;
function nextTempId(): string {
  tempCounter += 1;
  return `temp-${tempCounter}`;
}

/** Changes one bubble in the cached chat (stars, "Replied", trash). */
function patchCachedMessage(
  data: MessagesCache | undefined,
  messageId: string,
  change: (m: ChatMessage) => ChatMessage | null,
): MessagesCache | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.flatMap((m) => {
        if (m.messageId !== messageId) return [m];
        const next = change(m);
        return next ? [next] : [];
      }),
    })),
  };
}

export function ChatScreen() {
  return <RequireUser>{(me) => <ChatLoader me={me} />}</RequireUser>;
}

/** Loads the chat, then hands over to ChatView (which needs the first page to set itself up). */
function ChatLoader({ me }: { me: Me }) {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const conversation = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => api(`/conversations/${id}`, { schema: conversationItemSchema }),
  });
  const messages = useInfiniteQuery({
    queryKey: ['messages', id],
    queryFn: ({ pageParam }) =>
      api(`/conversations/${id}/messages${pageParam ? `?before=${pageParam}` : ''}`, {
        schema: chatMessagesPageSchema,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });

  if (conversation.isError || messages.isError) {
    return (
      <div className="flex min-h-dvh flex-col">
        <div className="flex h-16 items-center px-1">
          <IconButton label={t('common.back')} icon={ArrowLeft} onClick={() => navigate('/m')} />
        </div>
        <p className="p-8 text-center text-text-muted">{t('errors.NOT_FOUND')}</p>
      </div>
    );
  }
  if (!conversation.data || !messages.data) {
    return (
      <div className="flex min-h-dvh flex-col">
        <div className="flex h-16 items-center px-1">
          <IconButton label={t('common.back')} icon={ArrowLeft} onClick={() => navigate('/m')} />
        </div>
        <SkeletonRows count={4} />
      </div>
    );
  }
  return (
    <ChatView
      key={id}
      me={me}
      conversation={conversation.data}
      pages={messages.data.pages}
      hasOlder={messages.hasNextPage}
      loadingOlder={messages.isFetchingNextPage}
      loadOlder={() => void messages.fetchNextPage()}
    />
  );
}

/**
 * One chat (docs/spec/07-mobile-ui.md, "Chat screen"): wallpaper, date
 * separators, an unread divider, bubbles with swipe-to-reply, and the input
 * bar. New emails arrive live (see live.tsx).
 */
function ChatView({
  me,
  conversation,
  pages,
  hasOlder,
  loadingOlder,
  loadOlder,
}: {
  me: Me;
  conversation: ConversationItem;
  pages: ChatMessagesPage[];
  hasOlder: boolean;
  loadingOlder: boolean;
  loadOlder: () => void;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const errorText = useErrorText();
  const [searchParams] = useSearchParams();
  const id = conversation.id;
  const isGroup = conversation.kind === 'group';
  const title = conversation.kind === 'self' ? t('chat.you') : conversation.title;
  useDocumentTitle(title);

  // Oldest first: pages come newest-first, each page oldest-to-newest.
  const list = useMemo(() => [...pages].reverse().flatMap((p) => p.items), [pages]);

  // Where the unread emails started when the chat was opened ("3 unread emails").
  const [firstUnread] = useState(() => {
    const unread = list.filter((m) => m.direction === 'incoming' && !m.isRead);
    return unread.length ? { messageId: unread[0].messageId, count: unread.length } : null;
  });
  const [highlight, setHighlight] = useState<string | null>(() => searchParams.get('focus'));
  const [pending, setPending] = useState<ChatMessage[]>([]);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [actionsFor, setActionsFor] = useState<ChatMessage | null>(null);
  const [seenCount, setSeenCount] = useState(list.length);
  const [awayFromBottom, setAwayFromBottom] = useState(false);

  const scroller = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const heightBeforeOlder = useRef<number | null>(null);
  const markingRead = useRef(false);
  const lastSavedDraft = useRef(
    JSON.stringify({ subject: conversation.chatDraft?.subject ?? '', body: conversation.chatDraft?.body ?? '' }),
  );

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // First paint: the linked email, else the unread divider, else the newest email.
  useLayoutEffect(() => {
    const target = highlight
      ? document.getElementById(`msg-${highlight}`)
      : firstUnread
        ? document.getElementById('unread-divider')
        : null;
    if (target) target.scrollIntoView({ block: 'center' });
    else scrollToBottom();
    // Only when the chat opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The flash on a jumped-to email fades after a moment.
  useEffect(() => {
    if (!highlight) return;
    const timer = setTimeout(() => setHighlight(null), 1800);
    return () => clearTimeout(timer);
  }, [highlight]);

  // Older emails were added on top: keep the view where it was.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && heightBeforeOlder.current !== null) {
      el.scrollTop += el.scrollHeight - heightBeforeOlder.current;
      heightBeforeOlder.current = null;
    }
  }, [pages.length]);

  // A new email while you're at the bottom: follow it.
  useLayoutEffect(() => {
    if (nearBottom.current) scrollToBottom(true);
  }, [list.length, pending.length, scrollToBottom]);

  // Opening the chat (or a new email arriving while it's open) marks it read.
  useEffect(() => {
    const hasUnread = list.some((m) => m.direction === 'incoming' && !m.isRead);
    if (!hasUnread || markingRead.current) return;
    markingRead.current = true;
    api(`/conversations/${id}/read`, { method: 'POST' })
      .then(() => {
        queryClient.setQueryData<MessagesCache>(['messages', id], (data) =>
          data
            ? {
                ...data,
                pages: data.pages.map((p) => ({
                  ...p,
                  items: p.items.map((m) => (m.direction === 'incoming' ? { ...m, isRead: true } : m)),
                })),
              }
            : data,
        );
        void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      })
      .catch(() => undefined)
      .finally(() => {
        markingRead.current = false;
      });
  }, [list, id, queryClient]);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    nearBottom.current = distance < 150;
    setAwayFromBottom(distance > 300);
    if (nearBottom.current) setSeenCount(list.length);
    if (el.scrollTop < 150 && hasOlder && !loadingOlder) {
      heightBeforeOlder.current = el.scrollHeight;
      loadOlder();
    }
  }

  function jumpTo(messageId: string, conversationId?: string | null) {
    const target = document.getElementById(`msg-${messageId}`);
    if (target) {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setHighlight(messageId);
    } else if (conversationId && conversationId !== id) {
      navigate(`/m/chat/${conversationId}?focus=${messageId}`);
    } else {
      toast(t('chat.olderEmail'));
    }
  }

  function openReader(message: ChatMessage) {
    navigate(`/m/read/${encodeURIComponent(message.threadId)}?message=${message.messageId}`);
  }

  async function send(email: OutgoingEmail): Promise<boolean> {
    const target = replyTo;
    const tempId = nextTempId();
    const optimistic: ChatMessage = {
      entryId: tempId,
      messageId: tempId,
      threadId: '',
      direction: 'outgoing',
      from: { name: me.displayName ?? me.phoneDisplay, address: me.address, color: '#0f766e' },
      subject: target ? '' : email.subject,
      text: email.body,
      isLong: false,
      isReply: Boolean(target),
      hasHtml: false,
      attachments: email.attachments,
      sentAt: new Date().toISOString(),
      deliveryState: 'sending',
      isRead: true,
      isStarred: false,
      repliedAt: null,
      replyMessageId: null,
      parent: target
        ? {
            messageId: target.messageId,
            fromName: target.direction === 'outgoing' ? t('chat.you') : target.from.name,
            subject: target.subject,
            snippet: target.text.slice(0, 140),
            conversationId: id,
            conversationTitle: null,
          }
        : null,
    };
    setPending((current) => [...current, optimistic]);
    setReplyTo(null);
    nearBottom.current = true;

    try {
      const result = await api('/messages', {
        method: 'POST',
        body: {
          conversationId: id,
          subject: target ? undefined : email.subject || undefined,
          body: email.body,
          replyToMessageId: target?.messageId,
          attachmentIds: email.attachments.map((a) => a.id),
        },
        schema: sendMessageResponseSchema,
      });
      if (target) {
        queryClient.setQueryData<MessagesCache>(['messages', id], (data) =>
          patchCachedMessage(data, target.messageId, (m) => ({
            ...m,
            repliedAt: new Date().toISOString(),
            replyMessageId: result.messageId,
          })),
        );
      }
      // The live event usually delivered the real bubble already; if not, fetch it.
      const cached = queryClient.getQueryData<MessagesCache>(['messages', id]);
      const arrived = cached?.pages.some((p) => p.items.some((m) => m.messageId === result.messageId));
      if (!arrived) await queryClient.invalidateQueries({ queryKey: ['messages', id] });
      saveDraft({ subject: '', body: '' });
      return true;
    } catch (err) {
      toast(errorText(err));
      if (target) setReplyTo(target);
      return false;
    } finally {
      setPending((current) => current.filter((m) => m.entryId !== tempId));
    }
  }

  const saveDraft = useCallback(
    (draft: { subject: string; body: string }) => {
      const serialized = JSON.stringify(draft);
      if (serialized === lastSavedDraft.current) return;
      lastSavedDraft.current = serialized;
      void api(`/conversations/${id}`, {
        method: 'PATCH',
        body: { chatDraftSubject: draft.subject || null, chatDraftBody: draft.body || null },
      }).catch(() => undefined);
    },
    [id],
  );

  function openFullView(draft: { subject: string; body: string }) {
    saveDraft(draft);
    const reply = replyTo ? `&replyTo=${replyTo.messageId}` : '';
    navigate(`/m/compose?conversation=${id}${reply}`);
  }

  async function star(message: ChatMessage) {
    const isStarred = !message.isStarred;
    queryClient.setQueryData<MessagesCache>(['messages', id], (data) =>
      patchCachedMessage(data, message.messageId, (m) => ({ ...m, isStarred })),
    );
    await api('/entries', { method: 'PATCH', body: { ids: [message.entryId], isStarred } }).catch((err) =>
      toast(errorText(err)),
    );
  }

  async function trash(message: ChatMessage) {
    queryClient.setQueryData<MessagesCache>(['messages', id], (data) =>
      patchCachedMessage(data, message.messageId, () => null),
    );
    try {
      await api('/entries/trash', { method: 'POST', body: { ids: [message.entryId] } });
      toast(t('home.movedToTrash'));
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    } catch (err) {
      toast(errorText(err));
      void queryClient.invalidateQueries({ queryKey: ['messages', id] });
    }
  }

  async function chatAction(action: 'favorite' | 'spam' | 'trash') {
    try {
      if (action === 'favorite') {
        const updated = await api(`/conversations/${id}`, {
          method: 'PATCH',
          body: { isFavorite: !conversation.isFavorite },
          schema: conversationItemSchema,
        });
        queryClient.setQueryData(['conversation', id], updated);
        toast(updated.isFavorite ? t('chat.addedFavorite') : t('chat.removedFavorite'));
        void queryClient.invalidateQueries({ queryKey: ['conversations'] });
        return;
      }
      await api(`/conversations/${id}/${action}`, { method: 'POST' });
      toast(action === 'spam' ? t('home.reportedSpam') : t('home.movedToTrash'));
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      navigate('/m', { replace: true });
    } catch (err) {
      toast(errorText(err));
    }
  }

  const unseen = Math.max(0, list.length - seenCount);
  const all = [...list, ...pending];

  return (
    <div className="flex h-dvh flex-col">
      <header className="z-20 flex h-16 shrink-0 items-center gap-1 bg-surface px-1 pt-[env(safe-area-inset-top)] shadow-[0_1px_0_rgba(0,0,0,0.06)]">
        <IconButton label={t('common.back')} icon={ArrowLeft} onClick={() => navigate('/m')} />
        <button
          type="button"
          onClick={() => navigate(`/m/chat/${id}/info`)}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 text-left"
          aria-label={t('chat.openInfo', { name: title })}
        >
          <Avatar avatar={conversation.avatar} size={40} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[1.0625rem] font-medium">{title}</span>
            <span className="truncate text-[0.8125rem] text-text-muted">
              {conversation.kind === 'self' ? me.address : conversation.subtitle}
            </span>
          </span>
        </button>
        <OverflowMenu
          label={t('chat.moreOptions')}
          items={[
            { label: t('chat.info'), onClick: () => navigate(`/m/chat/${id}/info`) },
            {
              label: conversation.isFavorite ? t('home.unfavorite') : t('home.addFavorite'),
              onClick: () => void chatAction('favorite'),
            },
            { label: t('home.reportSpam'), onClick: () => void chatAction('spam') },
            { label: t('chat.moveChatToTrash'), onClick: () => void chatAction('trash'), danger: true },
          ]}
        />
      </header>
      <OfflineBanner />

      <div
        ref={scroller}
        onScroll={onScroll}
        className="relative flex-1 overflow-y-auto overscroll-contain pb-2"
        style={{ backgroundColor: 'var(--color-chat-bg)', backgroundImage: WALLPAPER_URL }}
      >
        {loadingOlder && (
          <p className="py-2 text-center text-[0.75rem] text-text-muted">{t('placeholder.checking')}</p>
        )}
        {all.length === 0 && (
          <p className="mx-auto mt-6 w-fit max-w-[80%] rounded-lg bg-[#fff5c4] px-3 py-2 text-center text-[0.8125rem] text-text">
            {t('chat.emptyChat')}
          </p>
        )}
        {/* One section per day, so each day's label sticks only while that day is on screen. */}
        <ol aria-label={t('chat.emails')} className="flex flex-col pt-1">
          {groupByDay(all).map((day) => (
            <li key={day.key}>
              <section aria-label={daySeparator(day.sentAt, i18n.language, t)}>
                <div className="sticky top-2 z-10 my-2 flex justify-center" aria-hidden="true">
                  <span className="rounded-lg bg-surface px-3 py-1 text-[0.75rem] text-text-muted shadow-sm">
                    {daySeparator(day.sentAt, i18n.language, t)}
                  </span>
                </div>
                <ol>
                  {day.messages.map((message, index) => {
                    const previous = day.messages[index - 1];
                    const unreadStartsHere = firstUnread?.messageId === message.messageId;
                    const firstOfRun =
                      !previous ||
                      unreadStartsHere ||
                      previous.direction !== message.direction ||
                      previous.from.address !== message.from.address;
                    return (
                      <Fragment key={message.entryId}>
                        {unreadStartsHere && (
                          <li id="unread-divider" className="my-2 bg-white/60 py-1 text-center">
                            <span className="rounded-full bg-surface px-3 py-1 text-[0.75rem] font-medium text-text-muted shadow-sm">
                              {t('chat.unreadDivider', { count: firstUnread.count })}
                            </span>
                          </li>
                        )}
                        <li>
                          <Bubble
                            message={message}
                            isGroup={isGroup}
                            firstOfRun={firstOfRun}
                            pending={message.entryId.startsWith('temp-')}
                            highlighted={highlight === message.messageId}
                            onReply={setReplyTo}
                            onOpen={openReader}
                            onActions={setActionsFor}
                            onJump={jumpTo}
                          />
                        </li>
                      </Fragment>
                    );
                  })}
                </ol>
              </section>
            </li>
          ))}
        </ol>
      </div>

      {awayFromBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          aria-label={t('chat.scrollToBottom')}
          className="absolute right-4 bottom-24 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-surface text-text-muted shadow-md"
        >
          <ChevronsDown size={22} aria-hidden="true" />
          {unseen > 0 && (
            <span className="absolute -top-1.5 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[0.6875rem] font-medium text-white">
              {unseen}
            </span>
          )}
        </button>
      )}

      <div style={{ backgroundColor: 'var(--color-chat-bg)' }}>
        <ChatInput
          initialDraft={conversation.chatDraft}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          onSend={send}
          onFullView={openFullView}
          onDraftChange={saveDraft}
        />
      </div>

      <MessageActions
        message={actionsFor}
        onClose={() => setActionsFor(null)}
        handlers={{
          onReply: setReplyTo,
          onReplyFullView: (m) => navigate(`/m/compose?conversation=${id}&replyTo=${m.messageId}`),
          onOpen: openReader,
          onStar: (m) => void star(m),
          onTrash: (m) => void trash(m),
        }}
      />
    </div>
  );
}
