import { memo, useRef, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { CornerUpLeft, Download, FileText, Mail, Reply, Star } from 'lucide-react';
import type { ChatMessage } from '@phonemail/shared';
import { fileSize, timeOfDay } from '../../shared/time';
import { Ticks } from '../ui/Ticks';
import { toast } from '../ui/toast';
import { useLongPress } from '../ui/useLongPress';

/** How far to drag before letting go counts as "reply" (docs/spec/07, "Swipe right to reply"). */
const SWIPE_THRESHOLD = 64;

/** WhatsApp-style bubble tails, drawn outside the top corner of the first bubble in a run. */
function Tail({ side }: { side: 'left' | 'right' }) {
  const fill = side === 'left' ? 'var(--color-bubble-in)' : 'var(--color-bubble-out)';
  return (
    <svg
      aria-hidden="true"
      width="8"
      height="13"
      viewBox="0 0 8 13"
      className={`absolute top-0 ${side === 'left' ? '-left-2' : '-right-2'}`}
    >
      <path
        fill={fill}
        d={
          side === 'left'
            ? 'M1.533 3.568 8 12.193V1H2.812C1.042 1 .474 2.156 1.533 3.568z'
            : 'M5.188 1H0v11.193l6.467-8.625C7.526 2.156 6.958 1 5.188 1z'
        }
      />
    </svg>
  );
}

export interface BubbleProps {
  message: ChatMessage;
  isGroup: boolean;
  firstOfRun: boolean;
  /** Shown right away with a clock while it's being sent. */
  pending?: boolean;
  highlighted?: boolean;
  onReply: (message: ChatMessage) => void;
  onOpen: (message: ChatMessage) => void;
  onActions: (message: ChatMessage) => void;
  onJump: (messageId: string, conversationId?: string | null) => void;
}

/**
 * One email in the chat view. Swipe right (or long-press → Reply) to reply;
 * tap to open it in full view. Every gesture has a button alternative.
 */
export const Bubble = memo(function Bubble({
  message,
  isGroup,
  firstOfRun,
  pending = false,
  highlighted = false,
  onReply,
  onOpen,
  onActions,
  onJump,
}: BubbleProps) {
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const outgoing = message.direction === 'outgoing';
  const canReply = !message.repliedAt && !pending;

  const x = useMotionValue(0);
  const iconOpacity = useTransform(x, [0, SWIPE_THRESHOLD * 0.6], [0, 1]);
  const crossed = useRef(false);
  const dragged = useRef(false);
  const press = useLongPress(() => onActions(message));

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen(message);
    }
  }

  const bubbleColor = outgoing ? 'bg-bubble-out' : 'bg-bubble-in';
  const corner = firstOfRun ? (outgoing ? 'rounded-tr-none' : 'rounded-tl-none') : '';
  const images = message.attachments.filter((a) => a.contentType.startsWith('image/'));
  const files = message.attachments.filter((a) => !a.contentType.startsWith('image/'));

  return (
    <div
      id={`msg-${message.messageId}`}
      className={`relative flex px-3 ${outgoing ? 'justify-end' : 'justify-start'} ${firstOfRun ? 'mt-2' : 'mt-0.5'}`}
    >
      {!reduceMotion && (
        <motion.span
          aria-hidden="true"
          style={{ opacity: iconOpacity }}
          className="absolute top-1/2 left-3 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-text-muted shadow-sm"
        >
          <Reply size={18} />
        </motion.span>
      )}

      <motion.div
        drag={reduceMotion || pending ? false : 'x'}
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0, right: canReply ? 0.55 : 0.12 }}
        dragSnapToOrigin
        style={{ x, touchAction: 'pan-y' }}
        onDragStart={() => {
          dragged.current = true;
        }}
        onDrag={(_, info) => {
          if (info.offset.x > SWIPE_THRESHOLD && !crossed.current) {
            crossed.current = true;
            if (canReply) navigator.vibrate?.(10);
          }
        }}
        onDragEnd={(_, info) => {
          crossed.current = false;
          if (info.offset.x <= SWIPE_THRESHOLD) return;
          if (canReply) onReply(message);
          else if (!pending) toast(t('chat.alreadyReplied'));
        }}
        className="flex max-w-[80%] min-w-0 flex-col"
      >
        <div
          role="button"
          tabIndex={0}
          aria-label={t(outgoing ? 'chat.yourEmail' : 'chat.emailFrom', {
            name: message.from.name,
          })}
          aria-describedby={`msg-body-${message.messageId}`}
          {...press}
          onKeyDown={onKeyDown}
          onClick={() => {
            if (press.consumeClick() || dragged.current) {
              dragged.current = false;
              return;
            }
            if (!pending) onOpen(message);
          }}
          className={`relative cursor-pointer rounded-lg px-2.5 pt-1.5 pb-1 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] transition-shadow select-none ${bubbleColor} ${corner} ${
            highlighted ? 'ring-2 ring-brand/70' : ''
          }`}
        >
          {firstOfRun && <Tail side={outgoing ? 'right' : 'left'} />}
          <div id={`msg-body-${message.messageId}`}>
            {isGroup && !outgoing && firstOfRun && (
              <p className="text-[0.8125rem] font-medium" style={{ color: message.from.color }}>
                {message.from.name}
              </p>
            )}

            {message.parent && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onJump(message.parent!.messageId, message.parent!.conversationId);
                }}
                className="my-1 flex w-full flex-col rounded-md border-l-4 bg-black/[0.05] px-2 py-1 text-left"
                style={{ borderColor: 'var(--color-brand)' }}
                aria-label={t('chat.repliedTo', { name: message.parent.fromName })}
              >
                <span className="text-[0.8125rem] font-medium text-brand">
                  {message.parent.fromName}
                  {message.parent.conversationTitle && (
                    <span className="font-normal text-text-muted">
                      {' '}
                      · {t('chat.inChat', { chat: message.parent.conversationTitle })}
                    </span>
                  )}
                </span>
                <span className="line-clamp-2 text-[0.8125rem] text-text-muted">
                  {message.parent.subject.replace(/^re:\s*/i, '') || message.parent.snippet}
                </span>
              </button>
            )}

            {!message.isReply && message.subject && (
              <p className="flex items-center gap-1.5 text-[0.9375rem] font-semibold">
                <Mail size={14} aria-hidden="true" className="shrink-0 text-text-muted" />
                <span className="break-words">{message.subject}</span>
              </p>
            )}

            {message.text && (
              <p
                className={`text-[0.9375rem] leading-snug break-words whitespace-pre-wrap ${
                  message.isLong ? 'line-clamp-[12]' : ''
                }`}
              >
                {message.text}
              </p>
            )}
            {message.isLong && (
              <span className="text-[0.875rem] font-medium text-link">{t('chat.readMore')}</span>
            )}

            {images.length > 0 && (
              <div className={`mt-1 grid gap-1 ${images.length > 1 ? 'grid-cols-2' : ''}`}>
                {images.map((image) => (
                  <a
                    key={image.id}
                    href={`/api/attachments/${image.id}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="block overflow-hidden rounded-md"
                  >
                    <img
                      src={`/api/attachments/${image.id}`}
                      alt={image.filename}
                      loading="lazy"
                      className="max-h-60 w-full object-cover"
                    />
                  </a>
                ))}
              </div>
            )}
            {files.map((file) => (
              <a
                key={file.id}
                href={`/api/attachments/${file.id}`}
                download={file.filename}
                onClick={(e) => e.stopPropagation()}
                className="mt-1 flex items-center gap-2 rounded-md bg-black/[0.05] px-2 py-2"
              >
                <FileText size={28} aria-hidden="true" className="shrink-0 text-danger" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[0.875rem]">{file.filename}</span>
                  <span className="text-[0.75rem] text-text-muted">
                    {fileSize(file.sizeBytes, i18n.language)} ·{' '}
                    {file.filename.split('.').pop()?.toUpperCase()}
                  </span>
                </span>
                <Download size={18} aria-label={t('chat.download')} className="text-text-muted" />
              </a>
            ))}
          </div>

          <span className="float-right mt-1 ml-3 flex translate-y-0.5 items-center gap-1 text-[0.6875rem] text-text-muted">
            {message.isStarred && (
              <Star size={11} className="fill-text-muted" aria-label={t('chat.starred')} />
            )}
            <time dateTime={message.sentAt}>{timeOfDay(message.sentAt, i18n.language)}</time>
            {outgoing && <Ticks state={pending ? 'sending' : message.deliveryState} size={15} />}
          </span>
          <span className="clear-both block" aria-hidden="true" />
        </div>

        {message.repliedAt && (
          <button
            type="button"
            onClick={() => message.replyMessageId && onJump(message.replyMessageId)}
            className={`mt-0.5 flex items-center gap-1 text-[0.75rem] font-medium text-link ${
              outgoing ? 'self-end' : 'self-start'
            }`}
          >
            <CornerUpLeft size={13} aria-hidden="true" />
            {t('chat.replied')}
          </button>
        )}
      </motion.div>
    </div>
  );
});
