import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ChevronDown,
  Download,
  FileText,
  ImageOff,
  Inbox,
  Mail,
  OctagonAlert,
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
import { api } from '../shared/api';
import { attachmentUrl } from '../shared/attachments';
import { useMe } from '../shared/session';
import { useDocumentTitle } from '../shared/useDocumentTitle';
import { fileSize, fullDate, listDate } from '../shared/time';
import { EmailFrame } from '../mobile/read/EmailFrame';
import { Avatar } from '../mobile/ui/Avatar';
import { IconButton } from '../mobile/ui/IconButton';
import { useGoBack } from '../mobile/ui/useGoBack';
import { useEntryActions } from './actions';
import { useHotkeys } from './hotkeys';
import { folderLabelKey } from './MailList';
import { useWeb } from './store';

/** /mail/:folder/:threadId: the reading view. */
export function ThreadView() {
  const { folder = 'inbox', threadId = '' } = useParams();
  const { t } = useTranslation();
  const me = useMe();
  const goBack = useGoBack(`/mail/${folderLabelKey(folder) ? folder : 'inbox'}`);
  const thread = useQuery({
    queryKey: ['thread', threadId],
    queryFn: () => api(`/threads/${encodeURIComponent(threadId)}`, { schema: threadSchema }),
  });

  if (!thread.data || !me.data) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-12 items-center px-2">
          <IconButton label={t('web.backToList')} icon={ArrowLeft} size={18} onClick={goBack} />
        </div>
        <p className="p-10 text-center text-text-muted" role="status">
          {thread.isError ? t('errors.NOT_FOUND') : t('placeholder.checking')}
        </p>
      </div>
    );
  }
  return (
    <ThreadDetail
      key={threadId}
      me={me.data}
      folder={folder}
      thread={thread.data}
      goBack={goBack}
    />
  );
}

/**
 * The thread as a column of cards (docs/spec/08-web-ui.md, "Reading view"):
 * the newest email and any unread ones open, the rest folded to one line.
 * Reply respects reply-once: an email you answered shows "Replied" instead.
 */
function ThreadDetail({
  me,
  folder,
  thread,
  goBack,
}: {
  me: Me;
  folder: string;
  thread: Thread;
  goBack: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const actions = useEntryActions();
  const openCompose = useWeb((s) => s.openCompose);
  const messages = thread.messages;
  const newest = messages[messages.length - 1];
  const [expanded, setExpanded] = useState<Set<string>>(
    () =>
      new Set(
        messages.filter((m, i) => i === messages.length - 1 || !m.isRead).map((m) => m.messageId),
      ),
  );
  useDocumentTitle(thread.subject || t('chat.noSubject'));

  const allIds = messages.map((m) => m.entryId);
  const labelKey = folderLabelKey(folder);
  const inSpam = messages.some((m) => m.isSpam);

  // Opening the thread reads it.
  useEffect(() => {
    const unread = messages.filter((m) => !m.isRead).map((m) => m.entryId);
    if (unread.length === 0) return;
    api('/entries', { method: 'PATCH', body: { ids: unread, isRead: true } })
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ['mailbox'] });
        void queryClient.invalidateQueries({ queryKey: ['mailbox-counts'] });
        void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      })
      .catch(() => undefined);
    // Once per thread: marking unread again from here must not be undone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function reply(message: ThreadMessage) {
    openCompose({
      conversationId: message.conversationId,
      replyToId: message.messageId,
      threadId: thread.threadId,
    });
  }

  function showReply(messageId: string) {
    setExpanded((current) => new Set(current).add(messageId));
    requestAnimationFrame(() =>
      document
        .getElementById(`card-${messageId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }

  async function leaveAfter(action: Promise<boolean>) {
    if (await action) goBack();
  }

  const lastReplyable = [...messages].reverse().find((m) => !m.repliedAt && !m.trashed);

  useHotkeys({
    u: goBack,
    r: () => lastReplyable && reply(lastReplyable),
    s: () => void actions.setStarred([newest.entryId], !newest.isStarred),
    '#': () => void leaveAfter(actions.trash(allIds)),
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-black/5 px-2">
        <IconButton label={t('web.backToList')} icon={ArrowLeft} size={18} onClick={goBack} />
        {inSpam ? (
          <IconButton
            label={t('folders.notSpam')}
            icon={Inbox}
            size={18}
            onClick={() => void leaveAfter(actions.notSpam(allIds))}
          />
        ) : (
          newest.direction === 'incoming' && (
            <IconButton
              label={t('home.reportSpam')}
              icon={OctagonAlert}
              size={18}
              onClick={() => void leaveAfter(actions.spam(allIds))}
            />
          )
        )}
        <IconButton
          label={t('home.moveToTrash')}
          icon={Trash2}
          size={18}
          onClick={() => void leaveAfter(actions.trash(allIds))}
        />
        <IconButton
          label={t('home.markUnread')}
          icon={Mail}
          size={18}
          onClick={() => void leaveAfter(actions.setRead([newest.entryId], false))}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 sm:px-8">
        <h1 className="flex flex-wrap items-center gap-3 pt-5 pb-4 pl-12 text-[1.375rem] break-words">
          {thread.subject || t('chat.noSubject')}
          {labelKey && folder !== 'search' && (
            <span className="rounded bg-black/[0.07] px-1.5 py-0.5 text-[0.75rem] text-text-muted">
              {t(labelKey)}
            </span>
          )}
        </h1>
        <ol className="flex flex-col">
          {messages.map((message) => (
            <li
              key={message.entryId}
              id={`card-${message.messageId}`}
              className="border-b border-black/[0.06] last:border-0"
            >
              <MessageCard
                me={me}
                message={message}
                open={expanded.has(message.messageId)}
                onToggle={() =>
                  setExpanded((current) => {
                    const next = new Set(current);
                    if (next.has(message.messageId)) next.delete(message.messageId);
                    else next.add(message.messageId);
                    return next;
                  })
                }
                onStar={() => void actions.setStarred([message.entryId], !message.isStarred)}
                onReply={() => reply(message)}
                onShowReply={showReply}
              />
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function MessageCard({
  me,
  message,
  open,
  onToggle,
  onStar,
  onReply,
  onShowReply,
}: {
  me: Me;
  message: ThreadMessage;
  open: boolean;
  onToggle: () => void;
  onStar: () => void;
  onReply: () => void;
  onShowReply: (messageId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [showImages, setShowImages] = useState(me.loadRemoteImages);
  const [details, setDetails] = useState(false);
  const name = message.from.name || message.from.address;
  const outgoing = message.direction === 'outgoing';
  const mine = (address: string) => address.toLowerCase() === me.address.toLowerCase();
  const toNames = [...message.to, ...message.cc]
    .map((a) => (mine(a) ? t('chat.me') : a.split('@')[0]))
    .join(', ');
  const files = message.html ? message.attachments.filter((a) => !a.isInline) : message.attachments;

  const avatar = (
    <Avatar
      avatar={{
        kind: 'initials',
        url: null,
        initials: initialsFor(name) || '•',
        color: colorFor(message.from.address),
      }}
      size={40}
    />
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={false}
        className="flex w-full items-center gap-3 py-3 text-left text-[0.875rem] hover:bg-black/[0.02]"
      >
        {avatar}
        <span className={`w-40 shrink-0 truncate ${message.isRead ? '' : 'font-bold'}`}>
          {outgoing ? t('chat.you') : name}
        </span>
        <span className="min-w-0 flex-1 truncate text-text-muted">
          {message.text.slice(0, 160)}
        </span>
        <span className="shrink-0 text-[0.75rem] text-text-muted">
          {listDate(message.sentAt, i18n.language)}
        </span>
      </button>
    );
  }

  return (
    <article aria-label={t('chat.emailFrom', { name })} className="py-3">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={true}
          aria-label={t('web.collapse')}
          className="rounded-full"
        >
          {avatar}
        </button>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-[0.875rem]">
            <span className="font-bold">{outgoing ? t('chat.you') : name}</span>
            <span className="text-[0.75rem] text-text-muted">&lt;{message.from.address}&gt;</span>
          </p>
          <button
            type="button"
            onClick={() => setDetails((d) => !d)}
            aria-expanded={details}
            className="flex items-center gap-0.5 text-[0.75rem] text-text-muted"
          >
            {t('reader.toSummary', { names: toNames })}
            <ChevronDown size={14} aria-hidden="true" />
            <span className="sr-only">
              {details ? t('reader.hideDetails') : t('reader.showDetails')}
            </span>
          </button>
          {details && (
            <dl className="mt-2 grid w-fit grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-lg border border-black/10 p-3 text-[0.75rem]">
              <dt className="text-text-muted">{t('chat.from')}</dt>
              <dd className="break-all">{message.from.address}</dd>
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
              <dd>{fullDate(message.sentAt, i18n.language)}</dd>
              <dt className="text-text-muted">{t('chat.messageId')}</dt>
              <dd className="break-all">{message.messageIdHeader}</dd>
            </dl>
          )}
        </div>
        <span className="shrink-0 pt-1 text-[0.75rem] text-text-muted">
          {fullDate(message.sentAt, i18n.language)}
        </span>
        <IconButton
          label={message.isStarred ? t('chat.unstar') : t('chat.star')}
          icon={Star}
          size={18}
          aria-pressed={message.isStarred}
          className={`h-9 w-9 ${message.isStarred ? '[&_svg]:fill-[#f5b301] [&_svg]:text-[#f5b301]' : ''}`}
          onClick={onStar}
        />
      </div>

      <div className="mt-3 pl-[3.25rem]">
        {message.html && message.hasRemoteImages && !showImages && (
          <div className="mb-3 flex items-center gap-3 rounded-lg bg-[#f6f8fc] px-3 py-2 text-[0.8125rem]">
            <ImageOff size={16} aria-hidden="true" className="shrink-0 text-text-muted" />
            <span className="flex-1">{t('reader.imagesHidden')}</span>
            <button
              type="button"
              onClick={() => setShowImages(true)}
              className="shrink-0 font-medium text-brand hover:underline"
            >
              {t('reader.showImages')}
            </button>
          </div>
        )}
        {message.html ? (
          <EmailFrame
            html={message.html}
            showRemote={showImages}
            title={t('reader.bodyTitle', { subject: message.subject || t('chat.noSubject') })}
            heightClass="h-[60vh] min-h-[240px] rounded-lg border border-black/[0.06]"
          />
        ) : (
          <p className="text-[0.9375rem] leading-relaxed break-words whitespace-pre-wrap">
            {message.text}
          </p>
        )}

        {files.length > 0 && (
          <ul
            aria-label={t('reader.attachments', { count: files.length })}
            className="mt-4 flex flex-wrap gap-2"
          >
            {files.map((file) => (
              <li key={file.id}>
                <a
                  href={attachmentUrl(file.id)}
                  download={file.filename}
                  className="flex w-56 items-center gap-2 rounded-lg border border-black/10 px-3 py-2 hover:bg-black/[0.03]"
                >
                  {file.contentType.startsWith('image/') ? (
                    <img
                      src={attachmentUrl(file.id)}
                      alt=""
                      loading="lazy"
                      className="h-8 w-8 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <FileText size={24} aria-hidden="true" className="shrink-0 text-danger" />
                  )}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[0.8125rem]">{file.filename}</span>
                    <span className="text-[0.6875rem] text-text-muted">
                      {fileSize(file.sizeBytes, i18n.language)}
                    </span>
                  </span>
                  <Download size={16} aria-label={t('chat.download')} className="text-text-muted" />
                </a>
              </li>
            ))}
          </ul>
        )}

        {!message.trashed && (
          <div className="mt-4">
            {message.repliedAt ? (
              message.replyMessageId ? (
                <button
                  type="button"
                  onClick={() => onShowReply(message.replyMessageId!)}
                  className="flex items-center gap-2 rounded-full border border-black/15 px-5 py-2 text-[0.875rem] text-text-muted hover:bg-black/[0.03]"
                >
                  <Reply size={16} aria-hidden="true" />
                  {t('reader.viewReply')}
                </button>
              ) : (
                <p className="text-[0.875rem] text-text-muted">{t('chat.alreadyReplied')}</p>
              )
            ) : (
              <button
                type="button"
                onClick={onReply}
                className="flex items-center gap-2 rounded-full border border-black/25 px-5 py-2 text-[0.875rem] font-medium hover:bg-black/[0.03]"
              >
                <Reply size={16} aria-hidden="true" />
                {t('chat.reply')}
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
