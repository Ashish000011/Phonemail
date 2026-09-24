import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Paperclip, Star } from 'lucide-react';
import type { ConversationItem } from '@phonemail/shared';
import { chatListTime } from '../../shared/time';
import { Avatar } from '../ui/Avatar';
import { Ticks } from '../ui/Ticks';
import { useLongPress } from '../ui/useLongPress';

function firstName(name: string): string {
  return /^\p{L}/u.test(name) ? name.split(/\s+/)[0] : name;
}

/** What the second line says: a draft, or the last email ("Subject · snippet"). */
function Preview({ chat }: { chat: ConversationItem }) {
  const { t } = useTranslation();
  if (chat.chatDraft) {
    return (
      <>
        <span className="shrink-0 text-brand">{t('home.draft')}</span>
        <span className="truncate">{chat.chatDraft.body || chat.chatDraft.subject}</span>
      </>
    );
  }
  const last = chat.lastMessage;
  if (!last) return null;
  const text = last.snippet;
  return (
    <>
      {last.fromMe && <Ticks state={last.deliveryState} />}
      {chat.kind === 'group' && !last.fromMe && (
        <span className="shrink-0">{firstName(last.fromName)}:</span>
      )}
      {last.hasAttachments && (
        <Paperclip size={15} className="shrink-0" aria-label={t('home.hasAttachments')} />
      )}
      <span className="truncate">
        {!last.isReply && last.subject && (
          <>
            <span className="font-medium text-text">{last.subject}</span>
            {text && ' · '}
          </>
        )}
        {text}
      </span>
    </>
  );
}

/**
 * One chat in the Home list (docs/spec/07-mobile-ui.md, "Chat rows"): avatar,
 * name (bold when unread), time (green when unread), preview with ticks,
 * paperclip or draft, unread badge, star for favorites.
 */
export const ChatRow = memo(function ChatRow({
  chat,
  selecting = false,
  selected = false,
  onOpen,
  onToggle,
  onLongPress,
}: {
  chat: ConversationItem;
  selecting?: boolean;
  selected?: boolean;
  onOpen: (chat: ConversationItem) => void;
  onToggle?: (chat: ConversationItem) => void;
  onLongPress?: (chat: ConversationItem) => void;
}) {
  const { t, i18n } = useTranslation();
  const press = useLongPress(() => onLongPress?.(chat));
  const unread = chat.unreadCount > 0;
  const title = chat.kind === 'self' ? t('chat.you') : chat.title;
  const time = chat.lastMessage ? chatListTime(chat.lastMessage.sentAt, i18n.language, t) : '';

  return (
    <li>
      <button
        type="button"
        {...(onLongPress ? press : {})}
        onClick={() => {
          if (press.consumeClick()) return;
          if (selecting) onToggle?.(chat);
          else onOpen(chat);
        }}
        aria-pressed={selecting ? selected : undefined}
        className={`flex h-[72px] w-full items-center gap-3 pl-4 text-left select-none ${
          selected ? 'bg-[#e7fce3]' : 'hover:bg-black/[0.03] active:bg-black/[0.06]'
        }`}
      >
        <span className="relative">
          <Avatar avatar={chat.avatar} />
          {selected && (
            <span className="absolute -right-0.5 -bottom-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-surface bg-brand text-white">
              <Check size={12} strokeWidth={3} aria-hidden="true" />
            </span>
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 self-stretch border-b border-black/[0.06] pr-4">
          <span className="flex items-baseline gap-2">
            <span className={`truncate text-[1.0625rem] ${unread ? 'font-semibold' : ''}`}>
              {title}
            </span>
            <span
              className={`ml-auto shrink-0 text-[0.75rem] ${unread ? 'font-medium text-brand' : 'text-text-muted'}`}
            >
              {time}
            </span>
          </span>
          <span className="flex items-center gap-1.5 text-[0.875rem] text-text-muted">
            <span className="flex min-w-0 flex-1 items-center gap-1">
              <Preview chat={chat} />
            </span>
            {chat.isFavorite && (
              <Star
                size={15}
                className="shrink-0 fill-text-muted"
                aria-label={t('home.favorite')}
              />
            )}
            {unread && (
              <span
                className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[0.75rem] font-medium text-white"
                aria-label={t('home.unreadCount', { count: chat.unreadCount })}
              >
                {chat.unreadCount}
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
});
