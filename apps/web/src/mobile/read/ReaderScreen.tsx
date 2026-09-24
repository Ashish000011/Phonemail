import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  ImageOff,
  Reply,
  Star,
  Trash2,
} from 'lucide-react';
import {
  colorFor,
  initialsFor,
  threadSchema,
  type Me,
  type Thread,
  type ThreadMessage,
} from '@phonemail/shared';
import { api } from '../../shared/api';
import { attachmentUrl } from '../../shared/attachments';
import { useErrorText } from '../../shared/errors';
import { useDocumentTitle } from '../../shared/useDocumentTitle';
import { fileSize, intlLocale } from '../../shared/time';
import { RequireUser } from '../MobileShell';
import { Avatar } from '../ui/Avatar';
import { IconButton } from '../ui/IconButton';
import { OverflowMenu } from '../ui/OverflowMenu';
import { TopBar } from '../ui/TopBar';
import { SkeletonRows } from '../ui/bits';
import { toast } from '../ui/toast';
import { useGoBack } from '../ui/useGoBack';
import { EmailFrame } from './EmailFrame';

export function ReaderScreen() {
  return <RequireUser>{(me) => <ReaderLoader me={me} />}</RequireUser>;
}

/** Loads the thread and picks the email to show (?message=, else the newest). */
function ReaderLoader({ me }: { me: Me }) {
  const { threadId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const goBack = useGoBack();
  const thread = useQuery({
    queryKey: ['thread', threadId],
    queryFn: () => api(`/threads/${encodeURIComponent(threadId)}`, { schema: threadSchema }),
  });

  const wanted = searchParams.get('message');
  const messages = thread.data?.messages ?? [];
  const message = messages.find((m) => m.messageId === wanted) ?? messages[messages.length - 1];

  if (!message) {
    return (
      <div className="flex min-h-dvh flex-col">
        <TopBar
          title=""
          left={<IconButton label={t('common.back')} icon={ArrowLeft} onClick={goBack} />}
        />
        {thread.isPending ? (
          <SkeletonRows count={3} />
        ) : (
          <p className="p-8 text-center text-text-muted">{t('errors.NOT_FOUND')}</p>
        )}
      </div>
    );
  }
  return <ReaderView key={message.messageId} me={me} thread={thread.data!} message={message} />;
}

/** "9876543210@phonemail.com" → "9876543210"; yourself → "me". */
function shortAddress(address: string, me: Me, t: (key: string) => string): string {
  if (address.toLowerCase() === me.address.toLowerCase()) return t('chat.me');
  return address.split('@')[0];
}

/**
 * The traditional reader (docs/spec/07-mobile-ui.md, "Traditional reader"):
 * subject, sender, expandable headers, the body (sandboxed HTML or plain
 * text), attachments, and Reply at the bottom (or "Replied" once you have).
 */
function ReaderView({ me, thread, message }: { me: Me; thread: Thread; message: ThreadMessage }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const goBack = useGoBack();
  const queryClient = useQueryClient();
  const errorText = useErrorText();
  const [showImages, setShowImages] = useState(me.loadRemoteImages);
  const [detailsOpen, setDetailsOpen] = useState(false);
  useDocumentTitle(message.subject || t('chat.noSubject'));

  const threadKey = ['thread', thread.threadId];
  const senderName = message.from.name || message.from.address;
  const outgoing = message.direction === 'outgoing';
  const when = new Intl.DateTimeFormat(intlLocale(i18n.language), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(message.sentAt));

  function patchThread(change: (m: ThreadMessage) => ThreadMessage) {
    queryClient.setQueryData<Thread>(threadKey, (data) =>
      data
        ? {
            ...data,
            messages: data.messages.map((m) => (m.entryId === message.entryId ? change(m) : m)),
          }
        : data,
    );
  }

  function refreshLists() {
    void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    void queryClient.invalidateQueries({ queryKey: ['messages', message.conversationId] });
  }

  // Opening an email marks it read.
  useEffect(() => {
    if (message.isRead) return;
    api('/entries', { method: 'PATCH', body: { ids: [message.entryId], isRead: true } })
      .then(() => {
        queryClient.setQueryData<Thread>(['thread', thread.threadId], (data) =>
          data
            ? {
                ...data,
                messages: data.messages.map((m) =>
                  m.entryId === message.entryId ? { ...m, isRead: true } : m,
                ),
              }
            : data,
        );
        void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      })
      .catch(() => undefined);
  }, [message.entryId, message.isRead, queryClient, thread.threadId]);

  async function star() {
    const isStarred = !message.isStarred;
    patchThread((m) => ({ ...m, isStarred }));
    try {
      await api('/entries', { method: 'PATCH', body: { ids: [message.entryId], isStarred } });
      toast(isStarred ? t('chat.starred') : t('reader.unstarred'));
      refreshLists();
    } catch (err) {
      patchThread((m) => ({ ...m, isStarred: !isStarred }));
      toast(errorText(err));
    }
  }

  async function move(action: 'trash' | 'spam') {
    try {
      await api(`/entries/${action}`, {
        method: 'POST',
        body:
          action === 'spam'
            ? { ids: [message.entryId], blockSender: true }
            : { ids: [message.entryId] },
      });
      toast(action === 'spam' ? t('home.reportedSpam') : t('home.movedToTrash'));
      refreshLists();
      void queryClient.invalidateQueries({ queryKey: threadKey });
      goBack();
    } catch (err) {
      toast(errorText(err));
    }
  }

  function reply() {
    navigate(
      `/m/compose?conversation=${message.conversationId}&replyTo=${message.messageId}&thread=${encodeURIComponent(thread.threadId)}`,
    );
  }

  const toNames = [...message.to, ...message.cc].map((a) => shortAddress(a, me, t)).join(', ');
  const listed = message.html
    ? message.attachments.filter((a) => !a.isInline)
    : message.attachments;
  const canAct = !message.trashed;

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar
        title=""
        left={<IconButton label={t('common.back')} icon={ArrowLeft} onClick={goBack} />}
        right={
          <>
            <IconButton
              label={message.isStarred ? t('chat.unstar') : t('chat.star')}
              icon={Star}
              onClick={() => void star()}
              className={message.isStarred ? '[&_svg]:fill-[#f5b301] [&_svg]:text-[#f5b301]' : ''}
            />
            {canAct && (
              <IconButton
                label={t('chat.moveToTrash')}
                icon={Trash2}
                onClick={() => void move('trash')}
              />
            )}
            <OverflowMenu
              label={t('chat.moreOptions')}
              items={[
                {
                  label: t('reader.openChat'),
                  onClick: () =>
                    navigate(`/m/chat/${message.conversationId}?focus=${message.messageId}`),
                },
                { label: t('chat.info'), onClick: () => setDetailsOpen(true) },
                ...(!outgoing && !message.isSpam
                  ? [{ label: t('home.reportSpam'), onClick: () => void move('spam') }]
                  : []),
              ]}
            />
          </>
        }
      />

      <main className="flex-1">
        <h2 className="px-4 pt-1 pb-3 text-[1.375rem] leading-snug break-words">
          {message.subject || t('chat.noSubject')}
          {thread.messages.length > 1 && (
            <span className="ml-2 align-middle text-[0.8125rem] text-text-muted">
              {t('reader.inThread', { count: thread.messages.length })}
            </span>
          )}
        </h2>

        <div className="flex items-start gap-3 px-4">
          <Avatar
            avatar={{
              kind: 'initials',
              url: null,
              initials: initialsFor(senderName) || '•',
              color: colorFor(message.from.address),
            }}
            size={40}
          />
          <div className="min-w-0 flex-1">
            <p className="flex items-baseline gap-2">
              <span className="truncate font-medium">{outgoing ? t('chat.you') : senderName}</span>
              <span className="ml-auto shrink-0 text-[0.75rem] text-text-muted">{when}</span>
            </p>
            <button
              type="button"
              onClick={() => setDetailsOpen((open) => !open)}
              aria-expanded={detailsOpen}
              aria-controls="reader-details"
              className="flex max-w-full items-center gap-1 rounded text-left text-[0.8125rem] text-text-muted"
            >
              <span className="truncate">{t('reader.toSummary', { names: toNames })}</span>
              {detailsOpen ? (
                <ChevronUp size={16} aria-hidden="true" className="shrink-0" />
              ) : (
                <ChevronDown size={16} aria-hidden="true" className="shrink-0" />
              )}
              <span className="sr-only">
                {detailsOpen ? t('reader.hideDetails') : t('reader.showDetails')}
              </span>
            </button>
          </div>
        </div>

        {detailsOpen && (
          <dl
            id="reader-details"
            className="mx-4 mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border border-black/10 p-3 text-[0.8125rem]"
          >
            <dt className="text-text-muted">{t('chat.from')}</dt>
            <dd className="break-all">
              {message.from.name
                ? `${message.from.name} <${message.from.address}>`
                : message.from.address}
            </dd>
            <dt className="text-text-muted">{t('chat.to')}</dt>
            <dd className="break-all">{message.to.join(', ')}</dd>
            {message.cc.length > 0 && (
              <>
                <dt className="text-text-muted">{t('chat.cc')}</dt>
                <dd className="break-all">{message.cc.join(', ')}</dd>
              </>
            )}
            {message.bcc.length > 0 && (
              <>
                <dt className="text-text-muted">{t('reader.bcc')}</dt>
                <dd className="break-all">{message.bcc.join(', ')}</dd>
              </>
            )}
            <dt className="text-text-muted">{t('chat.date')}</dt>
            <dd>{when}</dd>
            <dt className="text-text-muted">{t('chat.messageId')}</dt>
            <dd className="break-all">{message.messageIdHeader}</dd>
          </dl>
        )}

        {message.html && message.hasRemoteImages && !showImages && (
          <div className="mx-4 mt-3 flex items-center gap-3 rounded-lg bg-[#f0f2f5] px-3 py-2 text-[0.8125rem]">
            <ImageOff size={18} aria-hidden="true" className="shrink-0 text-text-muted" />
            <span className="flex-1">{t('reader.imagesHidden')}</span>
            <button
              type="button"
              onClick={() => setShowImages(true)}
              className="shrink-0 rounded-full px-3 py-1.5 font-medium text-brand hover:bg-black/5"
            >
              {t('reader.showImages')}
            </button>
          </div>
        )}

        {listed.length > 0 && (
          <section
            aria-label={t('reader.attachments', { count: listed.length })}
            className="mt-3 px-4"
          >
            <ul className="flex flex-col gap-1.5">
              {listed.map((file) => (
                <li key={file.id}>
                  <a
                    href={attachmentUrl(file.id)}
                    download={file.filename}
                    className="flex items-center gap-3 rounded-lg border border-black/10 px-3 py-2 hover:bg-black/[0.03]"
                  >
                    {file.contentType.startsWith('image/') ? (
                      <img
                        src={attachmentUrl(file.id)}
                        alt=""
                        loading="lazy"
                        className="h-10 w-10 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <FileText size={28} aria-hidden="true" className="shrink-0 text-danger" />
                    )}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[0.875rem]">{file.filename}</span>
                      <span className="text-[0.75rem] text-text-muted">
                        {fileSize(file.sizeBytes, i18n.language)}
                      </span>
                    </span>
                    <Download
                      size={18}
                      aria-label={t('chat.download')}
                      className="text-text-muted"
                    />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-3">
          {message.html ? (
            <EmailFrame
              html={message.html}
              showRemote={showImages}
              title={t('reader.bodyTitle', { subject: message.subject || t('chat.noSubject') })}
            />
          ) : (
            <p className="px-4 pb-6 text-[1rem] leading-relaxed break-words whitespace-pre-wrap">
              {message.text}
            </p>
          )}
        </div>
      </main>

      {canAct && (
        <div className="sticky bottom-0 border-t border-black/10 bg-surface px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {message.repliedAt && message.replyMessageId ? (
            <button
              type="button"
              onClick={() =>
                navigate(
                  `/m/read/${encodeURIComponent(thread.threadId)}?message=${message.replyMessageId}`,
                )
              }
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-black/15 text-[0.9375rem] font-medium text-text-muted"
            >
              <Reply size={18} aria-hidden="true" />
              {t('reader.viewReply')}
            </button>
          ) : message.repliedAt ? (
            <p className="py-2.5 text-center text-[0.875rem] text-text-muted">
              {t('chat.alreadyReplied')}
            </p>
          ) : (
            <button
              type="button"
              onClick={reply}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-brand text-[0.9375rem] font-medium text-white hover:bg-[#006e5a]"
            >
              <Reply size={18} aria-hidden="true" />
              {t('chat.reply')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
