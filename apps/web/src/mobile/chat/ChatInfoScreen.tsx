import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Ban, Copy, Heart, HeartOff, Mail, Pencil, Trash2 } from 'lucide-react';
import {
  conversationItemSchema,
  initialsFor,
  type ConversationItem,
  type Me,
  type Participant,
} from '@phonemail/shared';
import { api } from '../../shared/api';
import { useErrorText } from '../../shared/errors';
import { useDocumentTitle } from '../../shared/useDocumentTitle';
import { RequireUser } from '../MobileShell';
import { Avatar, avatarFromMe } from '../ui/Avatar';
import { Dialog } from '../ui/Dialog';
import { IconButton } from '../ui/IconButton';
import { TopBar } from '../ui/TopBar';
import { SkeletonRows } from '../ui/bits';
import { copyToClipboard } from '../ui/copy';
import { toast } from '../ui/toast';
import { useGoBack } from '../ui/useGoBack';

export function ChatInfoScreen() {
  return <RequireUser>{(me) => <ChatInfoLoader me={me} />}</RequireUser>;
}

function ChatInfoLoader({ me }: { me: Me }) {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const goBack = useGoBack(`/m/chat/${id}`);
  const conversation = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => api(`/conversations/${id}`, { schema: conversationItemSchema }),
  });
  if (!conversation.data) {
    return (
      <div className="flex min-h-dvh flex-col">
        <TopBar
          title=""
          left={<IconButton label={t('common.back')} icon={ArrowLeft} onClick={goBack} />}
        />
        {conversation.isError ? (
          <p className="p-8 text-center text-text-muted">{t('errors.NOT_FOUND')}</p>
        ) : (
          <SkeletonRows count={3} />
        )}
      </div>
    );
  }
  return <ChatInfo me={me} conversation={conversation.data} />;
}

function ActionRow({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`flex min-h-14 w-full items-center gap-5 px-6 text-left text-[1rem] hover:bg-black/[0.03] ${
          danger ? 'text-danger' : ''
        }`}
      >
        {icon}
        {label}
      </button>
    </li>
  );
}

/**
 * Chat info (tap the chat's name): who is in it, their address and number,
 * and what you can do with the whole chat. Tapping a group member opens your
 * 1:1 chat with them.
 */
function ChatInfo({ me, conversation }: { me: Me; conversation: ConversationItem }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const goBack = useGoBack(`/m/chat/${conversation.id}`);
  const queryClient = useQueryClient();
  const errorText = useErrorText();
  const [confirm, setConfirm] = useState<'spam' | 'trash' | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [newTitle, setNewTitle] = useState(conversation.title);

  const isGroup = conversation.kind === 'group';
  const isSelf = conversation.kind === 'self';
  const person: Participant | undefined =
    conversation.kind === 'direct' ? conversation.participants[0] : undefined;
  const title = isSelf ? t('chat.you') : conversation.title;
  useDocumentTitle(title);

  async function copy(text: string) {
    toast((await copyToClipboard(text)) ? t('common.copied') : text);
  }

  async function patch(body: { isFavorite?: boolean; title?: string | null }) {
    try {
      const updated = await api(`/conversations/${conversation.id}`, {
        method: 'PATCH',
        body,
        schema: conversationItemSchema,
      });
      queryClient.setQueryData(['conversation', conversation.id], updated);
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      return updated;
    } catch (err) {
      toast(errorText(err));
      return null;
    }
  }

  async function toggleFavorite() {
    const updated = await patch({ isFavorite: !conversation.isFavorite });
    if (updated) toast(updated.isFavorite ? t('chat.addedFavorite') : t('chat.removedFavorite'));
  }

  async function rename() {
    setRenaming(false);
    const next = newTitle.trim();
    if (next !== conversation.title) await patch({ title: next || null });
  }

  async function removeChat(action: 'spam' | 'trash') {
    setConfirm(null);
    try {
      await api(`/conversations/${conversation.id}/${action}`, { method: 'POST' });
      toast(action === 'spam' ? t('home.reportedSpam') : t('home.movedToTrash'));
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      navigate('/m', { replace: true });
    } catch (err) {
      toast(errorText(err));
    }
  }

  async function openDirect(member: Participant) {
    try {
      const chat = await api('/conversations/resolve', {
        method: 'POST',
        body: { phoneOrAddress: member.address },
        schema: conversationItemSchema,
      });
      navigate(`/m/chat/${chat.id}`);
    } catch (err) {
      toast(errorText(err));
    }
  }

  const address = isSelf ? me.address : person?.address;
  const phone = isSelf ? me.phoneDisplay : person?.phoneDisplay;

  return (
    <div className="flex min-h-dvh flex-col bg-[#f0f2f5]">
      <TopBar
        title={isGroup ? t('chatInfo.groupInfo') : t('chatInfo.contactInfo')}
        left={<IconButton label={t('common.back')} icon={ArrowLeft} onClick={goBack} />}
      />

      <section className="flex flex-col items-center bg-surface px-6 pt-4 pb-6 text-center">
        <Avatar avatar={conversation.avatar} size={112} />
        <h2 className="mt-3 flex items-center gap-1 text-[1.5rem] leading-tight break-words">
          {title}
          {isGroup && (
            <IconButton
              label={t('chatInfo.rename')}
              icon={Pencil}
              size={18}
              onClick={() => setRenaming(true)}
            />
          )}
        </h2>
        <p className="mt-1 text-[1rem] text-text-muted">
          {isGroup
            ? t('chatInfo.members', { count: conversation.participants.length + 1 })
            : (phone ?? address)}
        </p>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => navigate(`/m/compose?conversation=${conversation.id}`)}
            className="flex w-24 flex-col items-center gap-1 rounded-xl border border-black/10 py-3 text-[0.8125rem] text-brand hover:bg-black/[0.03]"
          >
            <Mail size={22} aria-hidden="true" />
            {t('chatInfo.email')}
          </button>
          {address && (
            <button
              type="button"
              onClick={() => void copy(address)}
              className="flex w-24 flex-col items-center gap-1 rounded-xl border border-black/10 py-3 text-[0.8125rem] text-brand hover:bg-black/[0.03]"
            >
              <Copy size={22} aria-hidden="true" />
              {t('chatInfo.copyAddress')}
            </button>
          )}
        </div>
      </section>

      {address && (
        <dl className="mt-2 bg-surface px-6 py-3">
          <dt className="text-[0.8125rem] text-text-muted">{t('chatInfo.address')}</dt>
          <dd className="mb-2 break-all">{address}</dd>
          {phone && (
            <>
              <dt className="text-[0.8125rem] text-text-muted">{t('chatInfo.phone')}</dt>
              <dd>{phone}</dd>
            </>
          )}
          {person && !person.userId && (
            <dd className="mt-2 text-[0.8125rem] text-text-muted">{t('chatInfo.outsideEmail')}</dd>
          )}
        </dl>
      )}

      {isGroup && (
        <section className="mt-2 bg-surface py-2" aria-labelledby="chat-members">
          <h3 id="chat-members" className="px-6 py-2 text-[0.875rem] text-text-muted">
            {t('chatInfo.members', { count: conversation.participants.length + 1 })}
          </h3>
          <ul>
            <li className="flex items-center gap-4 px-6 py-2">
              <Avatar avatar={avatarFromMe(me)} size={40} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{t('chat.you')}</span>
                <span className="truncate text-[0.8125rem] text-text-muted">{me.address}</span>
              </span>
            </li>
            {conversation.participants.map((member) => (
              <li key={member.identityKey}>
                <button
                  type="button"
                  onClick={() => void openDirect(member)}
                  className="flex w-full items-center gap-4 px-6 py-2 text-left hover:bg-black/[0.03]"
                  aria-label={t('chatInfo.openChatWith', { name: member.name })}
                >
                  <Avatar
                    avatar={{
                      kind: 'initials',
                      url: null,
                      initials: initialsFor(member.name),
                      color: member.color,
                    }}
                    size={40}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{member.name}</span>
                    <span className="truncate text-[0.8125rem] text-text-muted">
                      {member.phoneDisplay ?? member.address}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ul className="mt-2 mb-6 bg-surface py-1">
        <ActionRow
          icon={
            conversation.isFavorite ? (
              <HeartOff size={22} aria-hidden="true" className="text-text-muted" />
            ) : (
              <Heart size={22} aria-hidden="true" className="text-text-muted" />
            )
          }
          label={conversation.isFavorite ? t('home.unfavorite') : t('home.addFavorite')}
          onClick={() => void toggleFavorite()}
        />
        {!isSelf && (
          <ActionRow
            icon={<Ban size={22} aria-hidden="true" />}
            label={t('chatInfo.reportAndBlock')}
            onClick={() => setConfirm('spam')}
            danger
          />
        )}
        <ActionRow
          icon={<Trash2 size={22} aria-hidden="true" />}
          label={t('chat.moveChatToTrash')}
          onClick={() => setConfirm('trash')}
          danger
        />
      </ul>

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={
          confirm === 'spam' ? t('chatInfo.reportTitle', { name: title }) : t('chatInfo.trashTitle')
        }
        actions={[
          { label: t('common.cancel'), onClick: () => setConfirm(null) },
          {
            label: confirm === 'spam' ? t('chatInfo.reportConfirm') : t('chatInfo.trashConfirm'),
            onClick: () => void removeChat(confirm ?? 'trash'),
            danger: true,
          },
        ]}
      >
        <p>{confirm === 'spam' ? t('chatInfo.reportBody') : t('chatInfo.trashBody')}</p>
      </Dialog>

      <Dialog
        open={renaming}
        onClose={() => setRenaming(false)}
        title={t('chatInfo.rename')}
        actions={[
          { label: t('common.cancel'), onClick: () => setRenaming(false) },
          { label: t('chatInfo.save'), onClick: () => void rename() },
        ]}
      >
        <label htmlFor="group-title" className="sr-only">
          {t('chatInfo.groupName')}
        </label>
        <input
          id="group-title"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void rename();
          }}
          maxLength={80}
          placeholder={t('chatInfo.groupName')}
          className="w-full border-b-2 border-brand py-2 text-[1rem] outline-none"
        />
        <p className="mt-2 text-[0.8125rem] text-text-muted">{t('chatInfo.renameHint')}</p>
      </Dialog>
    </div>
  );
}
