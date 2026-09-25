import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Loader2, Lock, Paperclip, SendHorizontal, Trash2, X } from 'lucide-react';
import { z } from 'zod';
import {
  aliasSchema,
  contactSchema,
  conversationItemSchema,
  draftSchema,
  sendMessageResponseSchema,
  threadSchema,
  type Alias,
  type AttachmentInfo,
  type ChatMessagesPage,
  type ConversationItem,
  type ConversationPage,
  type Draft,
  type Me,
} from '@phonemail/shared';
import { api } from '../../shared/api';
import { uploadAttachments } from '../../shared/attachments';
import { useErrorText } from '../../shared/errors';
import { useDocumentTitle } from '../../shared/useDocumentTitle';
import { fileSize, fullDate } from '../../shared/time';
import { Dialog } from '../ui/Dialog';
import { IconButton } from '../ui/IconButton';
import { TopBar } from '../ui/TopBar';
import { SkeletonRows } from '../ui/bits';
import { toast } from '../ui/toast';
import {
  RecipientField,
  isValidRecipient,
  type Recipient,
  type Suggestion,
} from './RecipientField';

/** Autosave this long after typing stops (docs/spec/07, "Drafts autosave every few seconds"). */
const AUTOSAVE_MS = 2000;

/** What to write: a new email, one from a chat, a reply, or a saved draft. */
export interface ComposeTarget {
  draftId: string | null;
  conversationId: string | null;
  replyToId: string | null;
  /** The reader's thread, so the reply can quote the original */
  threadId: string | null;
  /** People to start with, e.g. "Write to" from a search */
  to?: string[];
}

export interface ComposerProps {
  me: Me;
  target: ComposeTarget;
  /** 'screen': the mobile full-screen composer. 'window': the web's floating window. */
  layout: 'screen' | 'window';
  onClosed: () => void;
  /** After sending; `fromChat` is true when the recipients came from a chat. */
  onSent: (conversationId: string, fromChat: boolean) => void;
  /** Minimize / full-screen buttons for the web window's title bar */
  windowControls?: ReactNode;
}

interface QuotedEmail {
  fromName: string;
  sentAt: string;
  text: string;
}

/**
 * Loads what the composer needs for its target, then mounts the form. Both
 * clients use it: the mobile full-screen composer and the web's floating
 * window, so the rules (locked recipients, reply once, drafts) are written once.
 */
export function Composer(props: ComposerProps) {
  const { target, layout, onClosed } = props;
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const draft = useQuery({
    queryKey: ['draft', target.draftId],
    queryFn: () => api(`/drafts/${target.draftId}`, { schema: draftSchema }),
    enabled: Boolean(target.draftId),
    gcTime: 0,
  });
  const conversationId = target.conversationId ?? draft.data?.conversationId ?? null;
  const replyToId = target.replyToId ?? draft.data?.replyToMessageId ?? null;

  const conversation = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => api(`/conversations/${conversationId}`, { schema: conversationItemSchema }),
    enabled: Boolean(conversationId),
  });
  const aliases = useQuery({
    queryKey: ['aliases'],
    queryFn: () => api('/aliases', { schema: z.array(aliasSchema) }),
  });
  const thread = useQuery({
    queryKey: ['thread', target.threadId],
    queryFn: () =>
      api(`/threads/${encodeURIComponent(target.threadId!)}`, { schema: threadSchema }),
    enabled: Boolean(target.threadId && replyToId),
  });

  // The email being answered, for the read-only quote: from the reader or the chat, whichever we have.
  const quoted = useMemo<QuotedEmail | null>(() => {
    if (!replyToId) return null;
    const fromThread = thread.data?.messages.find((m) => m.messageId === replyToId);
    if (fromThread) {
      return {
        fromName: fromThread.from.name || fromThread.from.address,
        sentAt: fromThread.sentAt,
        text: fromThread.text,
      };
    }
    const chat = queryClient.getQueryData<InfiniteData<ChatMessagesPage>>([
      'messages',
      conversationId,
    ]);
    const fromChat = chat?.pages.flatMap((p) => p.items).find((m) => m.messageId === replyToId);
    return fromChat
      ? { fromName: fromChat.from.name, sentAt: fromChat.sentAt, text: fromChat.text }
      : null;
  }, [replyToId, thread.data, queryClient, conversationId]);

  const failed = draft.isError || conversation.isError;
  const ready =
    (!target.draftId || draft.data) && (!conversationId || conversation.data) && !aliases.isPending;

  if (failed || !ready) {
    const body = failed ? (
      <p className="p-8 text-center text-text-muted">{t('errors.NOT_FOUND')}</p>
    ) : (
      <SkeletonRows count={3} />
    );
    return layout === 'screen' ? (
      <div className="flex min-h-dvh flex-col">
        <TopBar
          title={t('routes.compose')}
          left={<IconButton label={t('compose.close')} icon={X} onClick={onClosed} />}
        />
        {body}
      </div>
    ) : (
      <div className="flex h-full flex-col">
        <WindowHeader
          title={t('routes.compose')}
          onClose={onClosed}
          controls={props.windowControls}
        />
        {body}
      </div>
    );
  }
  return (
    <ComposeForm
      {...props}
      draft={draft.data ?? null}
      conversation={conversation.data ?? null}
      replyToId={replyToId}
      quoted={quoted}
      aliases={aliases.data ?? []}
    />
  );
}

function WindowHeader({
  title,
  onClose,
  controls,
}: {
  title: string;
  onClose: () => void;
  controls?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <header className="flex h-11 shrink-0 items-center gap-1 rounded-t-xl bg-[#f2f6fc] pr-1 pl-4">
      <h2 className="min-w-0 flex-1 truncate text-[0.875rem] font-medium">{title}</h2>
      {controls}
      <IconButton label={t('compose.close')} icon={X} size={18} onClick={onClose} />
    </header>
  );
}

/** People to suggest: shared contacts plus everyone in your recent chats. */
function useSuggestions(): Suggestion[] {
  const queryClient = useQueryClient();
  const contacts = useQuery({
    queryKey: ['contacts'],
    queryFn: () => api('/contacts', { schema: z.array(contactSchema) }),
    staleTime: 5 * 60_000,
  });
  return useMemo(() => {
    const byValue = new Map<string, Suggestion>();
    for (const c of contacts.data ?? []) {
      const value = c.address ?? c.phoneE164;
      byValue.set(value.toLowerCase(), { name: c.name, value, detail: c.phoneDisplay });
    }
    const lists = queryClient.getQueriesData<InfiniteData<ConversationPage>>({
      queryKey: ['conversations'],
    });
    for (const [, data] of lists) {
      for (const chat of data?.pages?.flatMap((p) => p.items) ?? []) {
        for (const p of chat.participants) {
          const key = p.address.toLowerCase();
          if (!byValue.has(key)) {
            byValue.set(key, {
              name: p.name,
              value: p.address,
              detail: p.phoneDisplay ?? p.address,
            });
          }
        }
      }
    }
    return [...byValue.values()];
  }, [contacts.data, queryClient]);
}

function toRecipients(values: string[]): Recipient[] {
  return values.map((value) => ({ value, label: value }));
}

/** Everything the composer edits. */
interface Fields {
  to: Recipient[];
  cc: Recipient[];
  bcc: Recipient[];
  fromAliasId: string | null;
  subject: string;
  body: string;
  attachments: AttachmentInfo[];
}

/** The fields as the drafts API takes them. */
function draftPayload(fields: Fields) {
  return {
    to: fields.to.map((r) => r.value),
    cc: fields.cc.map((r) => r.value),
    bcc: fields.bcc.map((r) => r.value),
    subject: fields.subject,
    body: fields.body,
    fromAliasId: fields.fromAliasId,
    attachmentIds: fields.attachments.map((a) => a.id),
  };
}

function serialize(fields: Fields): string {
  return JSON.stringify(draftPayload(fields));
}

/**
 * The traditional composer (docs/spec/07-mobile-ui.md, "Traditional
 * composer"; docs/spec/08-web-ui.md, "Compose"). From a chat the recipients
 * are locked, because a chat is its set of people; to write to someone else
 * you start a new email. Drafts save themselves: on the chat when you came
 * from one, otherwise in Drafts.
 */
function ComposeForm({
  me,
  target,
  layout,
  onClosed,
  onSent,
  windowControls,
  draft,
  conversation,
  replyToId,
  quoted,
  aliases,
}: ComposerProps & {
  draft: Draft | null;
  conversation: ConversationItem | null;
  replyToId: string | null;
  quoted: QuotedEmail | null;
  aliases: Alias[];
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const errorText = useErrorText();
  const suggestions = useSuggestions();

  const isReply = Boolean(replyToId);
  const locked = Boolean(conversation);
  // Where the unsent text lives: on the chat itself, or as a draft in Drafts.
  const store: 'chat' | 'drafts' = conversation && !draft ? 'chat' : 'drafts';
  const chatDraft = store === 'chat' ? conversation?.chatDraft : null;

  // What was loaded. Saving compares against it, so opening and closing saves nothing.
  const [initial] = useState<Fields>(() => {
    const wanted = draft?.fromAliasId ?? me.defaultSendAsAliasId;
    return {
      to: toRecipients(draft?.to ?? target.to ?? []),
      cc: toRecipients(draft?.cc ?? []),
      bcc: toRecipients(draft?.bcc ?? []),
      fromAliasId: aliases.some((a) => a.id === wanted) ? wanted : null,
      subject: draft?.subject ?? chatDraft?.subject ?? '',
      body: draft?.body ?? chatDraft?.body ?? '',
      // A saved draft only knows its files' ids.
      attachments: (draft?.attachmentIds ?? []).map((id, index) => ({
        id,
        filename: t('compose.attachmentN', { n: index + 1 }),
        contentType: 'application/octet-stream',
        sizeBytes: 0,
        isInline: false,
      })),
    };
  });
  const [to, setTo] = useState(initial.to);
  const [cc, setCc] = useState(initial.cc);
  const [bcc, setBcc] = useState(initial.bcc);
  const [showCcBcc, setShowCcBcc] = useState(initial.cc.length + initial.bcc.length > 0);
  const [fromAliasId, setFromAliasId] = useState(initial.fromAliasId);
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [attachments, setAttachments] = useState(initial.attachments);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const draftId = useRef<string | null>(draft?.id ?? null);
  const lastSaved = useRef(serialize(initial));
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const title = isReply
    ? t('compose.replyTitle')
    : subject.trim() && layout === 'window'
      ? subject.trim()
      : t('routes.compose');
  // The window floats over the mail list, which keeps its own tab title.
  useDocumentTitle(layout === 'screen' ? title : null);

  const fields: Fields = { to, cc, bcc, fromAliasId, subject, body, attachments };
  const snapshot = serialize(fields);
  const hasContent =
    to.length + cc.length + bcc.length > 0 ||
    subject.trim() !== '' ||
    body.trim() !== '' ||
    attachments.length > 0;

  const saveDraft = useCallback(async () => {
    if (snapshot === lastSaved.current) return;
    lastSaved.current = snapshot;
    const saved = JSON.parse(snapshot) as ReturnType<typeof draftPayload>;
    try {
      if (store === 'chat') {
        await api(`/conversations/${conversation!.id}`, {
          method: 'PATCH',
          body: {
            chatDraftSubject: isReply ? null : saved.subject || null,
            chatDraftBody: saved.body || null,
          },
        });
        void queryClient.invalidateQueries({ queryKey: ['conversation', conversation!.id] });
      } else {
        const payload = {
          ...saved,
          conversationId: conversation?.id ?? null,
          replyToMessageId: replyToId,
        };
        if (draftId.current) {
          await api(`/drafts/${draftId.current}`, { method: 'PATCH', body: payload });
        } else {
          const created = await api('/drafts', {
            method: 'POST',
            body: payload,
            schema: draftSchema,
          });
          draftId.current = created.id;
        }
      }
      void queryClient.invalidateQueries({ queryKey: ['drafts'] });
      void queryClient.invalidateQueries({ queryKey: ['mailbox-counts'] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    } catch {
      lastSaved.current = ''; // try again on the next change
    }
  }, [snapshot, store, conversation, isReply, replyToId, queryClient]);

  useEffect(() => {
    if (sending || (!hasContent && !draftId.current)) return;
    const timer = setTimeout(() => void saveDraft(), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [saveDraft, hasContent, sending]);

  // The body grows with the text; the page (or the window) scrolls, not the box.
  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [body]);

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

  async function discard() {
    setConfirmClose(false);
    lastSaved.current = snapshot; // stop the autosave
    try {
      if (store === 'chat') {
        await api(`/conversations/${conversation!.id}`, {
          method: 'PATCH',
          body: { chatDraftSubject: null, chatDraftBody: null },
        });
      } else if (draftId.current) {
        await api(`/drafts/${draftId.current}`, { method: 'DELETE' });
      }
    } catch {
      // Nothing to lose: at worst an empty draft stays behind.
    }
    void queryClient.invalidateQueries({ queryKey: ['drafts'] });
    void queryClient.invalidateQueries({ queryKey: ['mailbox-counts'] });
    void queryClient.invalidateQueries({ queryKey: ['conversation', conversation?.id] });
    void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    if (layout === 'window' && hasContent) toast(t('compose.discarded'));
    onClosed();
  }

  async function saveAndClose() {
    setConfirmClose(false);
    await saveDraft();
    toast(t('compose.draftSaved'));
    onClosed();
  }

  async function close() {
    if (!hasContent) {
      if (draftId.current) await discard();
      else onClosed();
      return;
    }
    // Gmail saves quietly when you close the window; the phone asks first.
    if (layout === 'window') await saveAndClose();
    else setConfirmClose(true);
  }

  async function send() {
    const recipients = [...to, ...cc, ...bcc];
    if (!locked && recipients.length === 0) {
      toast(t('errors.NO_RECIPIENTS'));
      return;
    }
    const invalid = recipients.find((r) => !isValidRecipient(r.value));
    if (!locked && invalid) {
      toast(t('errors.INVALID_RECIPIENT'));
      return;
    }
    if (!body.trim() && !subject.trim() && attachments.length === 0) {
      toast(t('compose.empty'));
      return;
    }

    const email = draftPayload(fields);
    setSending(true);
    try {
      const result = await api('/messages', {
        method: 'POST',
        body: {
          ...(conversation
            ? { conversationId: conversation.id }
            : { to: email.to, cc: email.cc, bcc: email.bcc }),
          subject: isReply ? undefined : subject.trim() || undefined,
          body,
          replyToMessageId: replyToId ?? undefined,
          // null picks the primary address even when an alias is the default.
          fromAliasId: aliases.length ? fromAliasId : undefined,
          attachmentIds: email.attachmentIds,
          draftId: draftId.current ?? undefined,
        },
        schema: sendMessageResponseSchema,
      });
      lastSaved.current = snapshot;
      if (store === 'chat') {
        await api(`/conversations/${conversation!.id}`, {
          method: 'PATCH',
          body: { chatDraftSubject: null, chatDraftBody: null },
        }).catch(() => undefined);
      }
      for (const queryKey of [
        ['conversations'],
        ['conversation', result.conversationId],
        ['messages', result.conversationId],
        ['drafts'],
        ['thread'],
        ['mailbox'],
        ['mailbox-counts'],
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
      toast(t('compose.sent'));
      onSent(result.conversationId, Boolean(conversation));
    } catch (err) {
      toast(errorText(err));
      setSending(false);
    }
  }

  const lockedNames =
    conversation?.kind === 'self'
      ? [t('chat.you')]
      : (conversation?.participants.map((p) => p.name) ?? []);
  const inWindow = layout === 'window';

  const fieldRows = (
    <>
      <div className="flex min-h-12 items-center gap-1.5 border-b border-black/10 px-4">
        <label htmlFor="compose-from" className="w-12 shrink-0 text-[0.9375rem] text-text-muted">
          {t('chat.from')}
        </label>
        {aliases.length > 0 ? (
          <select
            id="compose-from"
            value={fromAliasId ?? ''}
            onChange={(e) => setFromAliasId(e.target.value || null)}
            className="min-w-0 flex-1 truncate bg-transparent py-2 text-[1rem] outline-none"
          >
            <option value="">{me.address}</option>
            {aliases.map((a) => (
              <option key={a.id} value={a.id}>
                {a.address}
              </option>
            ))}
          </select>
        ) : (
          <output id="compose-from" className="min-w-0 flex-1 truncate text-[1rem]">
            {me.address}
          </output>
        )}
      </div>

      {locked ? (
        <div className="border-b border-black/10 px-4 py-2">
          <div className="flex items-center gap-1.5">
            <span className="w-12 shrink-0 text-[0.9375rem] text-text-muted">{t('chat.to')}</span>
            <ul className="flex min-w-0 flex-1 flex-wrap gap-1.5" aria-label={t('chat.to')}>
              {lockedNames.map((name) => (
                <li
                  key={name}
                  className="flex items-center gap-1 rounded-full bg-[#f0f2f5] px-2.5 py-0.5 text-[0.875rem]"
                >
                  <Lock size={12} aria-hidden="true" className="text-text-muted" />
                  {name}
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-1 pl-[3.375rem] text-[0.75rem] text-text-muted">
            {isReply ? t('compose.replyLockedHint') : t('compose.lockedHint')}
          </p>
        </div>
      ) : (
        <>
          <RecipientField
            label={t('chat.to')}
            values={to}
            onChange={setTo}
            suggestions={suggestions}
            autoFocus={!draft}
            trailing={
              !showCcBcc && (
                <button
                  type="button"
                  onClick={() => setShowCcBcc(true)}
                  className="shrink-0 rounded-full px-2 py-1 text-[0.8125rem] font-medium text-text-muted hover:bg-black/5"
                >
                  {t('compose.ccBcc')}
                </button>
              )
            }
          />
          {showCcBcc && (
            <>
              <RecipientField
                label={t('chat.cc')}
                values={cc}
                onChange={setCc}
                suggestions={suggestions}
              />
              <RecipientField
                label={t('reader.bcc')}
                values={bcc}
                onChange={setBcc}
                suggestions={suggestions}
              />
            </>
          )}
          {to.length + cc.length + bcc.length >= 2 && (
            <p className="border-b border-black/10 bg-[#f0f2f5] px-4 py-1.5 text-[0.75rem] text-text-muted">
              {t('compose.groupHint')}
            </p>
          )}
        </>
      )}

      {!isReply && (
        <div className="border-b border-black/10 px-4">
          <label htmlFor="compose-subject" className="sr-only">
            {t('chat.subject')}
          </label>
          <input
            id="compose-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t('chat.subject')}
            maxLength={300}
            className="min-h-12 w-full bg-transparent text-[1rem] outline-none placeholder:text-text-muted"
          />
        </div>
      )}

      <label htmlFor="compose-body" className="sr-only">
        {t('compose.body')}
      </label>
      <textarea
        id="compose-body"
        ref={textarea}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void send();
          }
        }}
        autoFocus={locked}
        placeholder={t('compose.body')}
        className={`w-full resize-none bg-transparent px-4 py-3 text-[1rem] leading-relaxed outline-none placeholder:text-text-muted ${
          inWindow ? 'min-h-48' : 'min-h-[40vh]'
        }`}
      />

      {attachments.length > 0 && (
        <ul aria-label={t('chat.attachments')} className="flex flex-col gap-1.5 px-4 pb-3">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 rounded-lg border border-black/10 py-1 pr-1 pl-3 text-[0.875rem]"
            >
              <Paperclip size={16} aria-hidden="true" className="shrink-0 text-text-muted" />
              <span className="min-w-0 flex-1 truncate">{a.filename}</span>
              {a.sizeBytes > 0 && (
                <span className="shrink-0 text-text-muted">
                  {fileSize(a.sizeBytes, i18n.language)}
                </span>
              )}
              <IconButton
                label={t('chat.removeAttachment', { name: a.filename })}
                icon={X}
                size={16}
                onClick={() => setAttachments((current) => current.filter((c) => c.id !== a.id))}
              />
            </li>
          ))}
        </ul>
      )}

      {quoted && (
        <figure className="mx-4 mb-6 border-l-[3px] border-black/15 pl-3 text-[0.875rem] text-text-muted">
          <figcaption className="mb-1">
            {t('compose.quoteIntro', {
              date: fullDate(quoted.sentAt, i18n.language),
              name: quoted.fromName,
            })}
          </figcaption>
          <blockquote className="line-clamp-[20] break-words whitespace-pre-wrap">
            {quoted.text}
          </blockquote>
        </figure>
      )}
    </>
  );

  const hiddenFileInput = (
    <input
      ref={fileInput}
      type="file"
      multiple
      hidden
      onChange={upload}
      aria-hidden="true"
      tabIndex={-1}
    />
  );

  if (inWindow) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <WindowHeader title={title} onClose={() => void close()} controls={windowControls} />
        <div className="min-h-0 flex-1 overflow-y-auto">{fieldRows}</div>
        <footer className="flex shrink-0 items-center gap-1 border-t border-black/10 px-3 py-2">
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending || uploading}
            className="flex min-h-10 items-center gap-2 rounded-full bg-brand px-5 text-[0.875rem] font-medium text-white hover:bg-[#006e5a] disabled:opacity-60"
          >
            {sending && <Loader2 size={16} aria-hidden="true" className="animate-spin" />}
            {t('chat.send')}
          </button>
          <IconButton
            label={t('chat.attach')}
            icon={uploading ? Loader2 : Paperclip}
            size={20}
            className={uploading ? '[&_svg]:animate-spin' : ''}
            onClick={() => fileInput.current?.click()}
            disabled={uploading || sending}
          />
          <span className="flex-1" />
          <IconButton
            label={t('compose.discardDraft')}
            icon={Trash2}
            size={20}
            onClick={() => void discard()}
            disabled={sending}
          />
        </footer>
        {hiddenFileInput}
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar
        title={title}
        left={<IconButton label={t('compose.close')} icon={X} onClick={() => void close()} />}
        right={
          <>
            <IconButton
              label={t('chat.attach')}
              icon={uploading ? Loader2 : Paperclip}
              className={uploading ? '[&_svg]:animate-spin' : ''}
              onClick={() => fileInput.current?.click()}
              disabled={uploading || sending}
            />
            <IconButton
              label={t('chat.send')}
              icon={sending ? Loader2 : SendHorizontal}
              className={`[&_svg]:text-brand ${sending ? '[&_svg]:animate-spin' : ''}`}
              onClick={() => void send()}
              disabled={sending || uploading}
            />
          </>
        }
        className="border-b border-black/10"
      />
      <main className="flex flex-1 flex-col">{fieldRows}</main>
      {hiddenFileInput}
      <Dialog
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        title={t('compose.saveDraftTitle')}
        actions={[
          { label: t('compose.discard'), onClick: () => void discard(), danger: true },
          { label: t('compose.save'), onClick: () => void saveAndClose(), autoFocus: true },
        ]}
      >
        <p>{t('compose.saveDraftBody')}</p>
      </Dialog>
    </div>
  );
}
