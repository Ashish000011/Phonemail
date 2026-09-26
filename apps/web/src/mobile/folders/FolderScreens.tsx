import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, FileText, ShieldAlert, Trash2 } from 'lucide-react';
import { z } from 'zod';
import {
  conversationItemSchema,
  draftSchema,
  mailboxPageSchema,
  type ConversationItem,
  type MailListItem,
} from '@phonemail/shared';
import { api } from '../../shared/api';
import { useErrorText } from '../../shared/errors';
import { chatListTime } from '../../shared/time';
import { ChatPreview } from '../home/ChatRow';
import { Avatar } from '../ui/Avatar';
import { EmptyState, SkeletonRows } from '../ui/bits';
import { Dialog } from '../ui/Dialog';
import { IconButton } from '../ui/IconButton';
import { TopBar } from '../ui/TopBar';
import { toast } from '../ui/toast';

const COLORS = ['#0f766e', '#1d4ed8', '#7c3aed', '#be185d', '#b45309', '#15803d'];
function colorOf(text: string) {
  let hash = 0;
  for (const ch of text) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}
function initialsOf(name: string) {
  return /^\p{L}/u.test(name) ? [...name][0].toUpperCase() : '';
}

/** After a restore: Home, the folders and the menu counts all change. */
function useRefreshLists() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['mailbox'] });
    void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    void queryClient.invalidateQueries({ queryKey: ['mailbox-counts'] });
  };
}

/**
 * Spam: one row per reported chat, like Home, and "Not spam" brings the whole
 * chat back (docs/spec/07, "Menu"). Rows don't open: a chat shows no spam mail.
 */
export function SpamScreen() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const errorText = useErrorText();
  const refresh = useRefreshLists();

  const list = useQuery({
    queryKey: ['mailbox', 'spam-chats'],
    queryFn: () => api('/conversations/spam', { schema: z.array(conversationItemSchema) }),
  });
  const notSpam = useMutation({
    mutationFn: (chat: ConversationItem) =>
      api(`/conversations/${chat.id}/not-spam`, { method: 'POST' }),
    onSuccess: () => {
      toast(t('folders.movedToChats'));
      refresh();
    },
    onError: (err) => toast(errorText(err)),
  });

  const chats = list.data ?? [];

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar
        title={t('menu.spam')}
        left={
          <IconButton label={t('common.back')} icon={ArrowLeft} onClick={() => navigate('/m')} />
        }
      />
      <p className="bg-app-bg px-4 py-2 text-[0.8125rem] text-text-muted">
        {t('folders.spamChatsHint')}
      </p>

      {list.isPending ? (
        <SkeletonRows count={4} />
      ) : chats.length === 0 ? (
        <EmptyState
          illustration={<ShieldAlert size={56} className="text-text-muted/40" aria-hidden="true" />}
          title={t('folders.spamEmpty')}
        />
      ) : (
        <ul>
          {chats.map((chat) => (
            <li key={chat.id} className="flex items-center gap-3 border-b border-black/[0.06] pl-4">
              <Avatar avatar={chat.avatar} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5 py-3">
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-[1.0625rem]">
                    {chat.kind === 'self' ? t('chat.you') : chat.title}
                  </span>
                  <span className="ml-auto shrink-0 text-[0.75rem] text-text-muted">
                    {chat.lastMessage ? chatListTime(chat.lastMessage.sentAt, i18n.language, t) : ''}
                  </span>
                </span>
                <span className="flex min-w-0 items-center gap-1 text-[0.875rem] text-text-muted">
                  <ChatPreview chat={chat} />
                </span>
              </span>
              <button
                type="button"
                disabled={notSpam.isPending}
                onClick={() => notSpam.mutate(chat)}
                className="mr-2 min-h-11 shrink-0 rounded-full px-3 text-[0.8125rem] font-medium text-brand hover:bg-black/5"
              >
                {t('folders.notSpam')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Trash: a plain email list in the chat-row style; each email can be restored. */
export function FolderScreen({ folder }: { folder: 'trash' }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const errorText = useErrorText();
  const refresh = useRefreshLists();
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  const list = useQuery({
    queryKey: ['mailbox', folder],
    queryFn: () => api(`/mailbox/${folder}`, { schema: mailboxPageSchema }),
  });

  const restore = useMutation({
    mutationFn: (item: MailListItem) =>
      api('/entries/restore', { method: 'POST', body: { ids: item.entryIds } }),
    onSuccess: () => {
      toast(t('folders.restored'));
      refresh();
    },
    onError: (err) => toast(errorText(err)),
  });
  const empty = useMutation({
    mutationFn: () => api('/trash/empty', { method: 'POST' }),
    onSuccess: () => {
      toast(t('folders.trashEmptied'));
      refresh();
    },
    onError: (err) => toast(errorText(err)),
  });

  const items = list.data?.items ?? [];

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar
        title={t(`menu.${folder}`)}
        left={
          <IconButton label={t('common.back')} icon={ArrowLeft} onClick={() => navigate('/m')} />
        }
        right={
          items.length > 0 ? (
            <button
              type="button"
              onClick={() => setConfirmEmpty(true)}
              className="mr-2 min-h-11 rounded-full px-3 text-[0.875rem] font-medium text-danger hover:bg-black/5"
            >
              {t('folders.emptyTrash')}
            </button>
          ) : undefined
        }
      />
      <p className="bg-app-bg px-4 py-2 text-[0.8125rem] text-text-muted">
        {t(`folders.${folder}Hint`)}
      </p>

      {list.isPending ? (
        <SkeletonRows count={4} />
      ) : items.length === 0 ? (
        <EmptyState
          illustration={<Trash2 size={56} className="text-text-muted/40" aria-hidden="true" />}
          title={t(`folders.${folder}Empty`)}
        />
      ) : (
        <ul>
          {items.map((item) => {
            const name = item.participants.map((p) => (p.me ? t('chat.me') : p.name)).join(', ');
            return (
              <li
                key={item.threadId}
                className="flex items-center gap-3 border-b border-black/[0.06] pl-4"
              >
                <button
                  type="button"
                  onClick={() => navigate(`/m/read/${encodeURIComponent(item.threadId)}`)}
                  className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left"
                >
                  <Avatar
                    avatar={{
                      kind: 'initials',
                      url: null,
                      initials: initialsOf(name),
                      color: colorOf(item.from.address),
                    }}
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-baseline gap-2">
                      <span className="truncate font-medium">{name}</span>
                      <span className="ml-auto shrink-0 text-[0.75rem] text-text-muted">
                        {chatListTime(item.sentAt, i18n.language, t)}
                      </span>
                    </span>
                    <span className="truncate text-[0.875rem]">
                      {item.subject || t('chat.noSubject')}
                    </span>
                    <span className="truncate text-[0.8125rem] text-text-muted">
                      {item.snippet}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => restore.mutate(item)}
                  className="mr-2 min-h-11 shrink-0 rounded-full px-3 text-[0.8125rem] font-medium text-brand hover:bg-black/5"
                >
                  {t('folders.restore')}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={confirmEmpty}
        onClose={() => setConfirmEmpty(false)}
        title={t('folders.emptyTrashTitle')}
        actions={[
          { label: t('common.cancel'), onClick: () => setConfirmEmpty(false), autoFocus: true },
          {
            label: t('folders.emptyTrash'),
            danger: true,
            onClick: () => {
              setConfirmEmpty(false);
              empty.mutate();
            },
          },
        ]}
      >
        {t('folders.emptyTrashBody')}
      </Dialog>
    </div>
  );
}

/** Drafts from both composers; tapping one continues it in the full composer. */
export function DraftsScreen() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const drafts = useQuery({
    queryKey: ['drafts'],
    queryFn: () => api('/drafts', { schema: z.array(draftSchema) }),
  });
  const items = drafts.data ?? [];

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar
        title={t('menu.drafts')}
        left={
          <IconButton label={t('common.back')} icon={ArrowLeft} onClick={() => navigate('/m')} />
        }
      />
      {drafts.isPending ? (
        <SkeletonRows count={3} />
      ) : items.length === 0 ? (
        <EmptyState
          illustration={<FileText size={56} className="text-text-muted/40" aria-hidden="true" />}
          title={t('folders.draftsEmpty')}
        />
      ) : (
        <ul>
          {items.map((draft) => (
            <li key={draft.id}>
              <button
                type="button"
                onClick={() => navigate(`/m/compose?draft=${draft.id}`)}
                className="flex w-full flex-col gap-0.5 border-b border-black/[0.06] px-4 py-3 text-left hover:bg-black/[0.03]"
              >
                <span className="flex items-baseline gap-2">
                  <span className="text-[0.875rem] font-medium text-danger">
                    {t('folders.draft')}
                  </span>
                  <span className="truncate text-[0.875rem]">
                    {draft.to.length ? draft.to.join(', ') : t('folders.noRecipients')}
                  </span>
                  <span className="ml-auto shrink-0 text-[0.75rem] text-text-muted">
                    {chatListTime(draft.updatedAt, i18n.language, t)}
                  </span>
                </span>
                <span className="truncate font-medium">{draft.subject || t('chat.noSubject')}</span>
                <span className="truncate text-[0.875rem] text-text-muted">{draft.body}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
