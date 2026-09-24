import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Copy, Info, Maximize2, Reply, Star, Trash2 } from 'lucide-react';
import { threadSchema, type ChatMessage } from '@phonemail/shared';
import { api } from '../../shared/api';
import { intlLocale } from '../../shared/time';
import { BottomSheet } from '../ui/BottomSheet';
import { Dialog } from '../ui/Dialog';
import { toast } from '../ui/toast';

export interface MessageActionHandlers {
  onReply: (m: ChatMessage) => void;
  onReplyFullView: (m: ChatMessage) => void;
  onOpen: (m: ChatMessage) => void;
  onStar: (m: ChatMessage) => void;
  onTrash: (m: ChatMessage) => void;
}

/**
 * Long-press on a bubble (docs/spec/07, "Chat screen"): everything swipe
 * does, plus more, as a list anyone can reach with a tap, keyboard or reader.
 */
export function MessageActions({
  message,
  onClose,
  handlers,
}: {
  message: ChatMessage | null;
  onClose: () => void;
  handlers: MessageActionHandlers;
}) {
  const { t, i18n } = useTranslation();
  const [infoFor, setInfoFor] = useState<ChatMessage | null>(null);

  const info = useQuery({
    queryKey: ['thread', infoFor?.threadId],
    queryFn: () => api(`/threads/${encodeURIComponent(infoFor!.threadId)}`, { schema: threadSchema }),
    enabled: Boolean(infoFor),
  });
  const details = info.data?.messages.find((m) => m.messageId === infoFor?.messageId);

  const canReply = message && !message.repliedAt;
  const run = (action: (m: ChatMessage) => void) => () => {
    if (!message) return;
    onClose();
    action(message);
  };

  const items = message
    ? [
        ...(canReply
          ? [
              { icon: Reply, label: t('chat.reply'), onClick: run(handlers.onReply) },
              { icon: Maximize2, label: t('chat.replyFullView'), onClick: run(handlers.onReplyFullView) },
            ]
          : []),
        { icon: Maximize2, label: t('chat.openInFullView'), onClick: run(handlers.onOpen) },
        {
          icon: Star,
          label: message.isStarred ? t('chat.unstar') : t('chat.star'),
          onClick: run(handlers.onStar),
        },
        {
          icon: Copy,
          label: t('chat.copyText'),
          onClick: run((m) => {
            navigator.clipboard
              .writeText([m.subject, m.text].filter(Boolean).join('\n\n'))
              .then(() => toast(t('common.copied')))
              .catch(() => undefined);
          }),
        },
        { icon: Info, label: t('chat.info'), onClick: run(setInfoFor) },
        { icon: Trash2, label: t('chat.moveToTrash'), onClick: run(handlers.onTrash), danger: true },
      ]
    : [];

  const fullDate = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale(i18n.language), { dateStyle: 'full', timeStyle: 'short' }).format(
      new Date(iso),
    );

  return (
    <>
      <BottomSheet open={message !== null} onClose={onClose}>
        <ul className="-mx-2 flex flex-col">
          {items.map(({ icon: Icon, label, onClick, danger }) => (
            <li key={label}>
              <button
                type="button"
                onClick={onClick}
                className={`flex min-h-12 w-full items-center gap-5 rounded-xl px-3 text-left text-[1rem] hover:bg-black/5 ${
                  danger ? 'text-danger' : ''
                }`}
              >
                <Icon size={22} aria-hidden="true" className={danger ? '' : 'text-text-muted'} />
                {label}
              </button>
            </li>
          ))}
        </ul>
      </BottomSheet>

      <Dialog
        open={infoFor !== null}
        onClose={() => setInfoFor(null)}
        title={t('chat.info')}
        actions={[{ label: t('onboarding.ok'), onClick: () => setInfoFor(null), autoFocus: true }]}
      >
        {infoFor && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[0.875rem] break-all text-text">
            <dt className="text-text-muted">{t('chat.from')}</dt>
            <dd>
              {infoFor.from.name} &lt;{infoFor.from.address}&gt;
            </dd>
            {details && (
              <>
                <dt className="text-text-muted">{t('chat.to')}</dt>
                <dd>{details.to.join(', ')}</dd>
                {details.cc.length > 0 && (
                  <>
                    <dt className="text-text-muted">{t('chat.cc')}</dt>
                    <dd>{details.cc.join(', ')}</dd>
                  </>
                )}
              </>
            )}
            <dt className="text-text-muted">{t('chat.date')}</dt>
            <dd className="break-normal">{fullDate(infoFor.sentAt)}</dd>
            {details && (
              <>
                <dt className="text-text-muted">{t('chat.messageId')}</dt>
                <dd className="font-mono text-[0.75rem]">{details.messageIdHeader}</dd>
              </>
            )}
          </dl>
        )}
      </Dialog>
    </>
  );
}
