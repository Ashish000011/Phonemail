import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Mail,
  MailOpen,
  Menu,
  Pencil,
  Search,
  ShieldAlert,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import {
  CONVERSATION_FILTERS,
  conversationPageSchema,
  type ConversationFilter,
  type ConversationItem,
  type Me,
} from '@phonemail/shared';
import { api } from '../../shared/api';
import { useErrorText } from '../../shared/errors';
import { Avatar, avatarFromMe } from '../ui/Avatar';
import { Chip, EmptyState, EnvelopeIllustration, SkeletonRows } from '../ui/bits';
import { IconButton } from '../ui/IconButton';
import { TopBar } from '../ui/TopBar';
import { toast } from '../ui/toast';
import { OfflineBanner } from '../live';
import { ChatRow } from './ChatRow';
import { MenuDrawer } from './MenuDrawer';
import { SearchResults } from './SearchResults';
import { NotificationCard } from './NotificationCard';

/**
 * Home (docs/spec/07-mobile-ui.md): no Inbox or Sent, just chats. Full-width
 * search, filter chips, chat rows, a compose button, and long-press
 * selection for bulk actions.
 */
export function HomeScreen({ me }: { me: Me }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const errorText = useErrorText();
  const [filter, setFilter] = useState<ConversationFilter>('all');
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [selected, setSelected] = useState<Map<string, ConversationItem>>(new Map());
  const sentinel = useRef<HTMLDivElement>(null);
  const selecting = selected.size > 0;

  const chats = useInfiniteQuery({
    queryKey: ['conversations', filter],
    queryFn: ({ pageParam }) =>
      api(
        `/conversations?filter=${filter}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
        {
          schema: conversationPageSchema,
        },
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = chats.data?.pages.flatMap((p) => p.items) ?? [];

  // Load the next page when the end of the list scrolls into view.
  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && chats.hasNextPage && !chats.isFetchingNextPage)
        void chats.fetchNextPage();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [chats]);

  const toggle = (chat: ConversationItem) =>
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(chat.id)) next.delete(chat.id);
      else next.set(chat.id, chat);
      return next;
    });

  /** Runs one action on every selected chat, then refreshes the list. */
  async function bulk(action: (chat: ConversationItem) => Promise<unknown>, done?: string) {
    try {
      await Promise.all([...selected.values()].map(action));
      if (done) toast(done);
    } catch (err) {
      toast(errorText(err));
    }
    setSelected(new Map());
    void queryClient.invalidateQueries({ queryKey: ['conversations'] });
  }

  const allFavorite = [...selected.values()].every((c) => c.isFavorite);
  const anyUnread = [...selected.values()].some((c) => c.unreadCount > 0);

  const selectionBar = (
    <TopBar
      className="bg-[#e7fce3]"
      left={
        <IconButton
          label={t('home.exitSelection')}
          icon={ArrowLeft}
          onClick={() => setSelected(new Map())}
        />
      }
      title={<span aria-live="polite">{t('home.selected', { count: selected.size })}</span>}
      right={
        <>
          <IconButton
            label={allFavorite ? t('home.unfavorite') : t('home.addFavorite')}
            icon={Star}
            onClick={() =>
              bulk((c) =>
                api(`/conversations/${c.id}`, {
                  method: 'PATCH',
                  body: { isFavorite: !allFavorite },
                }),
              )
            }
          />
          <IconButton
            label={anyUnread ? t('home.markRead') : t('home.markUnread')}
            icon={anyUnread ? MailOpen : Mail}
            onClick={() =>
              bulk((c) =>
                anyUnread
                  ? api(`/conversations/${c.id}/read`, { method: 'POST' })
                  : api(`/conversations/${c.id}`, { method: 'PATCH', body: { isUnread: true } }),
              )
            }
          />
          <IconButton
            label={t('home.moveToTrash')}
            icon={Trash2}
            onClick={() =>
              bulk(
                (c) => api(`/conversations/${c.id}/trash`, { method: 'POST' }),
                t('home.movedToTrash'),
              )
            }
          />
          <IconButton
            label={t('home.reportSpam')}
            icon={ShieldAlert}
            onClick={() =>
              bulk(
                (c) => api(`/conversations/${c.id}/spam`, { method: 'POST' }),
                t('home.reportedSpam'),
              )
            }
          />
        </>
      }
    />
  );

  const mainBar = (
    <TopBar
      title={t('app.name')}
      titleClassName="text-[1.375rem] text-brand font-semibold"
      left={<IconButton label={t('home.openMenu')} icon={Menu} onClick={() => setMenuOpen(true)} />}
      right={
        <button
          type="button"
          onClick={() => navigate('/m/settings')}
          aria-label={t('home.openSettings')}
          className="mr-2 flex h-11 w-11 items-center justify-center rounded-full hover:bg-black/5"
        >
          <Avatar avatar={avatarFromMe(me)} size={34} />
        </button>
      }
    />
  );

  return (
    <div className="flex min-h-dvh flex-col">
      {selecting ? selectionBar : mainBar}
      <OfflineBanner />

      <div className="px-4 pt-1 pb-2">
        <div className="flex h-11 items-center gap-3 rounded-full bg-app-bg px-4">
          <Search size={20} className="shrink-0 text-text-muted" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('home.searchPlaceholder')}
            aria-label={t('home.searchPlaceholder')}
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent text-[1rem] outline-none placeholder:text-text-muted"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t('home.clearSearch')}
              className="-mr-2 flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/5"
            >
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {query.trim() ? (
        <SearchResults query={query} />
      ) : (
        <>
          <div
            role="tablist"
            aria-label={t('home.filters')}
            className="flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none]"
          >
            {CONVERSATION_FILTERS.map((f) => (
              <Chip key={f} selected={filter === f} onClick={() => setFilter(f)}>
                {t(`home.filter.${f}`)}
              </Chip>
            ))}
          </div>

          <NotificationCard />

          {chats.isPending ? (
            <SkeletonRows />
          ) : chats.isError ? (
            <p className="px-8 py-12 text-center text-text-muted">{errorText(chats.error)}</p>
          ) : items.length === 0 ? (
            filter === 'all' ? (
              <EmptyState
                illustration={<EnvelopeIllustration />}
                title={t('home.emptyTitle')}
                body={t('home.emptyBody')}
              />
            ) : (
              <p className="px-8 py-12 text-center text-[0.9375rem] text-text-muted">
                {t(`home.emptyFilter.${filter}`)}
              </p>
            )
          ) : (
            <ul aria-label={t('home.chats')} className="pb-28">
              {items.map((chat) => (
                <ChatRow
                  key={chat.id}
                  chat={chat}
                  selecting={selecting}
                  selected={selected.has(chat.id)}
                  onOpen={(c) => navigate(`/m/chat/${c.id}`)}
                  onToggle={toggle}
                  onLongPress={toggle}
                />
              ))}
            </ul>
          )}
          <div ref={sentinel} aria-hidden="true" className="h-1" />
        </>
      )}

      {!selecting && (
        <button
          type="button"
          onClick={() => navigate('/m/compose')}
          aria-label={t('home.writeEmail')}
          className="fixed right-[max(1.25rem,calc(50vw-240px+1.25rem))] bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-white shadow-lg transition-transform hover:bg-[#006e5a] active:scale-95"
        >
          <Pencil size={24} aria-hidden="true" />
        </button>
      )}

      <MenuDrawer open={menuOpen} onClose={() => setMenuOpen(false)} me={me} />
    </div>
  );
}
