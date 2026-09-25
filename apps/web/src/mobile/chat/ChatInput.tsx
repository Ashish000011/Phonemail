import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Paperclip, SendHorizontal, Smile, X } from 'lucide-react';
import type { AttachmentInfo, ChatMessage } from '@phonemail/shared';
import { uploadAttachments } from '../../shared/attachments';
import { useErrorText } from '../../shared/errors';
import { fileSize } from '../../shared/time';
import { IconButton } from '../ui/IconButton';
import { toast } from '../ui/toast';
import { EmojiGrid } from './EmojiGrid';

export interface OutgoingEmail {
  subject: string;
  body: string;
  attachments: AttachmentInfo[];
}

/** "Write in full view": an envelope with an expand arrow, where WhatsApp has its camera. */
function FullViewIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2.5" y="6" width="14" height="11" rx="2" />
      <path d="M3.5 7.5l6 4.5 6-4.5" />
      <path d="M15 3h6v6M21 3l-5.5 5.5" />
    </svg>
  );
}

const MAX_LINES = 6;

/**
 * The bar at the bottom of a chat (docs/spec/07-mobile-ui.md, "Input area"):
 * a Subject line for new emails (hidden while replying), the reply bar, emoji,
 * an auto-growing message box, attach, "Write in full view", and send.
 * What you type is kept as the chat draft.
 */
export function ChatInput({
  initialDraft,
  replyTo,
  onCancelReply,
  onSend,
  onFullView,
  onDraftChange,
}: {
  initialDraft: { subject: string; body: string } | null;
  replyTo: ChatMessage | null;
  onCancelReply: () => void;
  /** Returns false if sending failed, so the text is kept. */
  onSend: (email: OutgoingEmail) => Promise<boolean>;
  onFullView: (draft: { subject: string; body: string }) => void;
  onDraftChange: (draft: { subject: string; body: string }) => void;
}) {
  const { t, i18n } = useTranslation();
  const errorText = useErrorText();
  const [subject, setSubject] = useState(initialDraft?.subject ?? '');
  const [body, setBody] = useState(initialDraft?.body ?? '');
  const [attachments, setAttachments] = useState<AttachmentInfo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Save the chat draft a second after typing stops (docs/spec/05, "Chat drafts").
  useEffect(() => {
    const timer = setTimeout(() => onDraftChange({ subject, body }), 1000);
    return () => clearTimeout(timer);
  }, [subject, body, onDraftChange]);

  // Grow with the text, up to six lines, then scroll.
  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 22;
    el.style.height = `${Math.min(el.scrollHeight, lineHeight * MAX_LINES)}px`;
  }, [body]);

  // Replying: jump to the message box.
  useEffect(() => {
    if (replyTo) textarea.current?.focus();
  }, [replyTo]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    if (files.length === 0) return;
    setUploading(true);
    try {
      const saved = await uploadAttachments(files);
      setAttachments((current) => [...current, ...saved]);
    } catch (err) {
      toast(errorText(err));
    } finally {
      setUploading(false);
    }
  }

  function insertEmoji(emoji: string) {
    const el = textarea.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + emoji + body.slice(end));
    setEmojiOpen(false);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  async function send() {
    const email = { subject: replyTo ? '' : subject.trim(), body, attachments };
    // Clear at once (the bubble appears with a clock); put it back if it fails.
    setSubject('');
    setBody('');
    setAttachments([]);
    const ok = await onSend(email);
    if (!ok) {
      setSubject(email.subject);
      setBody(email.body);
      setAttachments(email.attachments);
    }
  }

  const canSend = (body.trim().length > 0 || attachments.length > 0) && !uploading;

  return (
    <div className="px-2 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {attachments.length > 0 && (
        <ul aria-label={t('chat.attachments')} className="mb-1 flex flex-wrap gap-1.5 px-1">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-1 rounded-full bg-surface py-1 pr-1 pl-3 text-[0.8125rem] shadow-sm"
            >
              <span className="max-w-[160px] truncate">{a.filename}</span>
              <span className="text-text-muted">{fileSize(a.sizeBytes, i18n.language)}</span>
              <button
                type="button"
                aria-label={t('chat.removeAttachment', { name: a.filename })}
                onClick={() => setAttachments((current) => current.filter((c) => c.id !== a.id))}
                className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-black/5"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-1.5">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[1.5rem] bg-surface shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
          {replyTo ? (
            <div className="m-1.5 mb-0 flex items-start gap-2 rounded-xl border-l-4 border-brand bg-black/[0.05] py-1.5 pl-2">
              <div className="min-w-0 flex-1">
                <p className="text-[0.8125rem] font-medium text-brand">
                  {replyTo.direction === 'outgoing' ? t('chat.you') : replyTo.from.name}
                </p>
                <p className="truncate text-[0.8125rem] text-text-muted">
                  {replyTo.subject || replyTo.text}
                </p>
                <button
                  type="button"
                  onClick={() => onFullView({ subject: '', body })}
                  className="mt-0.5 text-[0.75rem] font-medium text-link"
                >
                  {t('chat.openInFullView')}
                </button>
              </div>
              <IconButton
                label={t('chat.cancelReply')}
                icon={X}
                size={18}
                onClick={onCancelReply}
              />
            </div>
          ) : (
            <>
              <label htmlFor="chat-subject" className="sr-only">
                {t('chat.subject')}
              </label>
              <input
                id="chat-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={t('chat.subject')}
                maxLength={300}
                className="mx-4 mt-2 border-b border-black/10 pb-1 text-[0.875rem] font-medium outline-none placeholder:font-normal placeholder:text-text-muted focus:border-brand"
              />
            </>
          )}

          <div className="flex items-end">
            <IconButton label={t('chat.emoji')} icon={Smile} onClick={() => setEmojiOpen(true)} />
            <label htmlFor="chat-message" className="sr-only">
              {t('chat.message')}
            </label>
            <textarea
              id="chat-message"
              ref={textarea}
              rows={1}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                // Enter makes a new line (emails have paragraphs); Ctrl/Cmd+Enter sends.
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canSend) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={t('chat.message')}
              className="min-w-0 flex-1 resize-none bg-transparent py-2.5 text-[1rem] leading-[1.4] outline-none placeholder:text-text-muted"
            />
            <IconButton
              label={t('chat.attach')}
              icon={uploading ? Loader2 : Paperclip}
              className={uploading ? '[&_svg]:animate-spin' : ''}
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
            />
            <button
              type="button"
              aria-label={t('chat.writeInFullView')}
              title={t('chat.writeInFullView')}
              onClick={() => onFullView({ subject, body })}
              className="mr-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-black/5"
            >
              <FullViewIcon />
            </button>
          </div>
        </div>

        {canSend && (
          <button
            type="button"
            onClick={() => void send()}
            aria-label={t('chat.send')}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-white shadow-sm hover:bg-[#006e5a] active:scale-95"
          >
            <SendHorizontal size={22} aria-hidden="true" />
          </button>
        )}
      </div>

      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={upload}
        aria-hidden="true"
        tabIndex={-1}
      />
      <EmojiGrid open={emojiOpen} onClose={() => setEmojiOpen(false)} onPick={insertEmoji} />
    </div>
  );
}
