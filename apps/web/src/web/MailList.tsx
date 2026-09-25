import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ArchiveRestore,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Mail,
  MailOpen,
  OctagonAlert,
  Paperclip,
  RotateCw,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { z } from 'zod';
import {
  FOLDERS,
  draftSchema,
  mailboxPageSchema,
  searchResponseSchema,
  type Draft,
  type Folder,
  type MailListItem,
} from '@phonemail/shared';
import { api } from '../shared/api';
import { useErrorText } from '../shared/errors';
import { useDocumentTitle } from '../shared/useDocumentTitle';
import { listDate } from '../shared/time';
import { Dialog } from '../mobile/ui/Dialog';
import { IconButton } from '../mobile/ui/IconButton';
import { toast } from '../mobile/ui/toast';
import { useEntryActions } from './actions';
import { useHotkeys } from './hotkeys';
import { useWeb } from './store';
import { useCounts } from './WebShell';

const FOLDER_LABELS: Record<Folder | 'drafts', string> = {
  inbox: 'web.inbox',
  starred: 'web.starred',
  sent: 'web.sent',
  spam: 'web.spam',
  trash: 'web.trash',
  drafts: 'web.drafts',
};

export function folderLabelKey(folder: string): string | null {
  return FOLDER_LABELS[folder as Folder] ?? null;
}

/** /mail/:folder: a Gmail folder, the drafts, or "not found". */
export function MailListRoute() {
  const { folder = 'inbox' } = useParams();
  const { t } = useTranslation();
  if (folder === 'drafts') return <DraftList />;
  if (!(FOLDERS as readonly string[]).includes(folder)) {
    return <p className="p-10 text-center text-text-muted">{t('errors.NOT_FOUND')}</p>;
  }
  return <FolderList key={folder} folder={folder as Folder} />;
}

/** The bar above a list: select all, refresh, actions, and paging on the right. */
function Toolbar({ children, paging }: { children: ReactNode; paging?: ReactNode }) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-1 border-b border-black/5 px-2">
      {children}
      <span className="flex-1" />
      {paging}
    </div>
  );
}

function SelectAll({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: (checked: boolean) => void;
}) {
  const { t } = useTranslation();
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (box.current) box.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <label className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full hover:bg-black/5">
      <input
        ref={box}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-brand"
      />
      <span className="sr-only">{t('web.selectAll')}</span>
    </label>
  );
}

function EmptyList({ text }: { text: string }) {
  return <p className="px-6 py-16 text-center text-text-muted">{text}</p>;
}

/**
 * One Gmail folder (docs/spec/08-web-ui.md, "List"): rows grouped by thread,
 * 50 per page, with selection, bulk actions, hover actions and shortcuts.
 */
function FolderList({ folder }: { folder: Folder }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const counts = useCounts();
  const actions = useEntryActions();
  const fresh = useWeb((s) => s.fresh);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [active, setActive] = useState(0);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const links = useRef<(HTMLAnchorElement | null)[]>([]);

  const list = useQuery({
    queryKey: ['mailbox', folder, page],
    queryFn: () => api(`/mailbox/${folder}?page=${page}`, { schema: mailboxPageSchema }),
    placeholderData: keepPreviousData,
  });
  const items = list.data?.items ?? [];
  const unread = folder === 'inbox' ? (counts.data?.inboxUnread ?? 0) : 0;
  useDocumentTitle(unread ? `(${unread}) ${t('web.inbox')}` : t(FOLDER_LABELS[folder]));

  const chosen = items.filter((i) => selected.has(i.threadId));
  const idsOf = (rows: MailListItem[]) => rows.flatMap((r) => r.entryIds);
  const activeItem = items[Math.min(active, items.length - 1)];

  function goToPage(next: number) {
    setSelected(new Set());
    setActive(0);
    setParams(next > 1 ? { page: String(next) } : {});
  }

  function open(item: MailListItem) {
    navigate(`/mail/${folder}/${encodeURIComponent(item.threadId)}`);
  }

  function toggle(threadId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      return next;
    });
  }

  function move(delta: number) {
    if (items.length === 0) return;
    const next = Math.max(0, Math.min(items.length - 1, active + delta));
    setActive(next);
    links.current[next]?.focus();
  }

  async function bulk(action: (ids: string[]) => Promise<boolean>, rows = chosen) {
    if (rows.length === 0) return;
    if (await action(idsOf(rows))) setSelected(new Set());
  }

  // What the thing under the cursor (or the selection) is for s and #.
  const targets = () => (chosen.length ? chosen : activeItem ? [activeItem] : []);

  useHotkeys({
    j: () => move(1),
    k: () => move(-1),
    o: () => activeItem && open(activeItem),
    Enter: () => activeItem && open(activeItem),
    x: () => activeItem && toggle(activeItem.threadId),
    s: () => activeItem && void actions.setStarred(activeItem.entryIds, !activeItem.isStarred),
    '#': () => void bulk(folder === 'trash' ? actions.deleteForever : actions.trash, targets()),
  });

  const allChecked = items.length > 0 && chosen.length === items.length;
  const anyUnread = chosen.some((i) => !i.isRead);
  const total = list.data?.total ?? 0;
  const pageSize = list.data?.pageSize ?? 50;
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        paging={
          total > 0 && (
            <>
              <span className="px-2 text-[0.75rem] text-text-muted">
                {t('web.range', { first, last, total })}
              </span>
              <IconButton
                label={t('web.newer')}
                icon={ChevronLeft}
                size={18}
                disabled={page <= 1}
                onClick={() => goToPage(page - 1)}
              />
              <IconButton
                label={t('web.older')}
                icon={ChevronRight}
                size={18}
                disabled={last >= total}
                onClick={() => goToPage(page + 1)}
              />
            </>
          )
        }
      >
        <SelectAll
          checked={allChecked}
          indeterminate={chosen.length > 0 && !allChecked}
          onChange={(on) => setSelected(on ? new Set(items.map((i) => i.threadId)) : new Set())}
        />
        {chosen.length === 0 ? (
          <IconButton
            label={t('web.refresh')}
            icon={RotateCw}
            size={18}
            onClick={() => {
              void list.refetch();
              void counts.refetch();
            }}
          />
        ) : folder === 'trash' ? (
          <>
            <IconButton
              label={t('folders.restore')}
              icon={ArchiveRestore}
              size={18}
              onClick={() => void bulk(actions.restore)}
            />
            <IconButton
              label={t('web.deleteForever')}
              icon={X}
              size={18}
              onClick={() => void bulk(actions.deleteForever)}
            />
          </>
        ) : (
          <>
            {folder === 'spam' ? (
              <IconButton
                label={t('folders.notSpam')}
                icon={Inbox}
                size={18}
                onClick={() => void bulk(actions.notSpam)}
              />
            ) : (
              folder !== 'sent' && (
                <IconButton
                  label={t('home.reportSpam')}
                  icon={OctagonAlert}
                  size={18}
                  onClick={() => void bulk(actions.spam)}
                />
              )
            )}
            <IconButton
              label={t('home.moveToTrash')}
              icon={Trash2}
              size={18}
              onClick={() => void bulk(actions.trash)}
            />
            <IconButton
              label={anyUnread ? t('home.markRead') : t('home.markUnread')}
              icon={anyUnread ? MailOpen : Mail}
              size={18}
              onClick={() => void bulk((ids) => actions.setRead(ids, anyUnread))}
            />
            <span className="ml-2 text-[0.8125rem] text-text-muted" aria-live="polite">
              {t('home.selected', { count: chosen.length })}
            </span>
          </>
        )}
      </Toolbar>

      {folder === 'trash' && items.length > 0 && (
        <p className="flex items-center justify-center gap-3 bg-[#f6f8fc] px-4 py-2 text-[0.8125rem] text-text-muted">
          {t('folders.trashHint')}
          <button
            type="button"
            onClick={() => setConfirmEmpty(true)}
            className="font-medium text-brand hover:underline"
          >
            {t('folders.emptyTrash')}
          </button>
        </p>
      )}
      {folder === 'spam' && items.length > 0 && (
        <p className="bg-[#f6f8fc] px-4 py-2 text-center text-[0.8125rem] text-text-muted">
          {t('folders.spamHint')}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {list.isPending ? (
          <p className="px-6 py-10 text-center text-text-muted" role="status">
            {t('placeholder.checking')}
          </p>
        ) : items.length === 0 ? (
          <EmptyList text={t(`web.empty_${folder}`)} />
        ) : (
          <ul aria-label={t(FOLDER_LABELS[folder])}>
            {items.map((item, index) => {
              const isSelected = selected.has(item.threadId);
              const names = item.participants.map((p) => (p.me ? t('web.me') : p.name)).join(', ');
              return (
                <li
                  key={item.threadId}
                  className={`group relative flex h-10 items-center border-b border-black/[0.06] text-[0.875rem] hover:z-10 hover:shadow-[0_1px_3px_rgba(60,64,67,0.3)] ${
                    isSelected
                      ? 'bg-[#d2f1e8]'
                      : fresh.has(item.messageId)
                        ? 'bg-[#fff5c4]'
                        : item.isRead
                          ? 'bg-[#f6f8fc]'
                          : 'bg-surface'
                  } ${index === active ? 'shadow-[inset_3px_0_0_var(--color-brand)]' : ''}`}
                >
                  <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(item.threadId)}
                      className="h-4 w-4 accent-brand"
                    />
                    <span className="sr-only">{t('web.selectRow', { name: names })}</span>
                  </label>
                  <button
                    type="button"
                    aria-pressed={item.isStarred}
                    aria-label={item.isStarred ? t('chat.unstar') : t('chat.star')}
                    onClick={() => void actions.setStarred(item.entryIds, !item.isStarred)}
                    className="flex h-10 w-8 shrink-0 items-center justify-center"
                  >
                    <Star
                      size={18}
                      aria-hidden="true"
                      className={item.isStarred ? 'fill-[#f5b301] text-[#f5b301]' : 'text-black/30'}
                    />
                  </button>
                  <Link
                    ref={(el) => {
                      links.current[index] = el;
                    }}
                    to={`/mail/${folder}/${encodeURIComponent(item.threadId)}`}
                    onFocus={() => setActive(index)}
                    className={`flex h-full min-w-0 flex-1 items-center gap-3 pr-3 pl-2 focus-visible:outline-offset-[-2px] ${
                      item.isRead ? '' : 'font-bold'
                    }`}
                  >
                    {!item.isRead && <span className="sr-only">{t('web.unread')}</span>}
                    <span className="w-28 shrink-0 truncate sm:w-44">
                      {names}
                      {item.count > 1 && (
                        <span className="ml-1 text-[0.75rem] font-normal text-text-muted">
                          {item.count}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {item.subject || t('chat.noSubject')}
                      <span className="font-normal text-text-muted"> – {item.snippet}</span>
                    </span>
                    {item.hasAttachments && (
                      <Paperclip
                        size={14}
                        aria-label={t('home.hasAttachments')}
                        className="shrink-0 text-text-muted"
                      />
                    )}
                    <span className="w-16 shrink-0 text-right text-[0.75rem] group-hover:invisible">
                      {listDate(item.sentAt, i18n.language)}
                    </span>
                  </Link>
                  <div className="absolute right-2 hidden items-center group-focus-within:flex group-hover:flex">
                    {folder === 'trash' ? (
                      <IconButton
                        label={t('folders.restore')}
                        icon={ArchiveRestore}
                        size={18}
                        className="h-9 w-9"
                        onClick={() => void actions.restore(item.entryIds)}
                      />
                    ) : (
                      <IconButton
                        label={t('home.moveToTrash')}
                        icon={Trash2}
                        size={18}
                        className="h-9 w-9"
                        onClick={() => void actions.trash(item.entryIds)}
                      />
                    )}
                    <IconButton
                      label={item.isRead ? t('home.markUnread') : t('home.markRead')}
                      icon={item.isRead ? Mail : MailOpen}
                      size={18}
                      className="h-9 w-9"
                      onClick={() => void actions.setRead(item.entryIds, !item.isRead)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog
        open={confirmEmpty}
        onClose={() => setConfirmEmpty(false)}
        title={t('folders.emptyTrashTitle')}
        actions={[
          { label: t('common.cancel'), onClick: () => setConfirmEmpty(false) },
          {
            label: t('folders.emptyTrash'),
            onClick: () => {
              setConfirmEmpty(false);
              void actions.emptyTrash();
            },
            danger: true,
          },
        ]}
      >
        <p>{t('folders.emptyTrashBody')}</p>
      </Dialog>
    </div>
  );
}

/** Drafts: saved emails that open again in the compose window. */
function DraftList() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const errorText = useErrorText();
  const openCompose = useWeb((s) => s.openCompose);
  useDocumentTitle(t('web.drafts'));
  const drafts = useQuery({
    queryKey: ['drafts'],
    queryFn: () => api('/drafts', { schema: z.array(draftSchema) }),
  });

  async function discard(draft: Draft) {
    try {
      await api(`/drafts/${draft.id}`, { method: 'DELETE' });
      toast(t('compose.discarded'));
    } catch (err) {
      toast(errorText(err));
    }
    void queryClient.invalidateQueries({ queryKey: ['drafts'] });
    void queryClient.invalidateQueries({ queryKey: ['mailbox-counts'] });
  }

  return (
    <div className="flex h-full flex-col">
      <Toolbar>
        <IconButton
          label={t('web.refresh')}
          icon={RotateCw}
          size={18}
          onClick={() => void drafts.refetch()}
        />
      </Toolbar>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {drafts.isPending ? null : !drafts.data?.length ? (
          <EmptyList text={t('folders.draftsEmpty')} />
        ) : (
          <ul aria-label={t('web.drafts')}>
            {drafts.data.map((draft) => {
              const to = [...draft.to, ...draft.cc, ...draft.bcc].join(', ');
              return (
                <li
                  key={draft.id}
                  className="group relative flex h-10 items-center border-b border-black/[0.06] bg-surface text-[0.875rem] hover:z-10 hover:shadow-[0_1px_3px_rgba(60,64,67,0.3)]"
                >
                  <button
                    type="button"
                    onClick={() => openCompose({ draftId: draft.id })}
                    className="flex h-full min-w-0 flex-1 items-center gap-3 pr-3 pl-6 text-left"
                  >
                    <span className="w-28 shrink-0 truncate sm:w-44">
                      <span className="text-danger">{t('folders.draft')}</span>
                      {to && <span className="text-text-muted"> · {to}</span>}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {draft.subject || t('chat.noSubject')}
                      <span className="text-text-muted"> – {draft.body.slice(0, 120)}</span>
                    </span>
                    <span className="w-16 shrink-0 text-right text-[0.75rem] group-hover:invisible">
                      {listDate(draft.updatedAt, i18n.language)}
                    </span>
                  </button>
                  <div className="absolute right-2 hidden group-focus-within:flex group-hover:flex">
                    <IconButton
                      label={t('compose.discardDraft')}
                      icon={Trash2}
                      size={18}
                      className="h-9 w-9"
                      onClick={() => void discard(draft)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/** /mail/search?q=: matching emails from every folder except Spam and Trash. */
export function SearchList() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const q = params.get('q')?.trim() ?? '';
  const openCompose = useWeb((s) => s.openCompose);
  useDocumentTitle(t('web.searchTitle', { q }));
  const results = useQuery({
    queryKey: ['search', q],
    queryFn: () => api(`/search?q=${encodeURIComponent(q)}`, { schema: searchResponseSchema }),
    enabled: q.length > 0,
  });
  const hits = results.data?.messages ?? [];

  return (
    <div className="flex h-full flex-col">
      <Toolbar>
        <h1 className="px-3 text-[0.9375rem]">{t('web.searchTitle', { q })}</h1>
      </Toolbar>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {results.data?.startChat && (
          <p className="border-b border-black/[0.06] px-6 py-3 text-[0.875rem]">
            {results.data.startChat.isPhoneMailUser
              ? t('web.writeTo', {
                  name: results.data.startChat.displayName ?? results.data.startChat.address,
                })
              : t('home.notOnPhoneMail')}{' '}
            {results.data.startChat.isPhoneMailUser && (
              <button
                type="button"
                onClick={() => openCompose({ to: [results.data!.startChat!.address] })}
                className="font-medium text-brand hover:underline"
              >
                {t('web.compose')}
              </button>
            )}
          </p>
        )}
        {results.isPending && q ? (
          <p className="px-6 py-10 text-center text-text-muted" role="status">
            {t('placeholder.checking')}
          </p>
        ) : hits.length === 0 ? (
          <EmptyList text={t('home.noResults')} />
        ) : (
          <ul aria-label={t('home.messages')}>
            {hits.map((hit) => (
              <li
                key={hit.entryId}
                className="border-b border-black/[0.06] text-[0.875rem] hover:shadow-[0_1px_3px_rgba(60,64,67,0.3)]"
              >
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      `/mail/search/${encodeURIComponent(hit.threadId)}?q=${encodeURIComponent(q)}`,
                    )
                  }
                  className="flex min-h-10 w-full items-center gap-3 px-6 py-2 text-left"
                >
                  <span className="w-28 shrink-0 truncate font-medium sm:w-44">
                    {hit.from.name}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{hit.subject || t('chat.noSubject')}</span>
                    {/* The server escapes everything except the <mark> around matches. */}
                    <span
                      className="block truncate text-text-muted [&_mark]:bg-[#fde293] [&_mark]:text-text"
                      dangerouslySetInnerHTML={{ __html: hit.highlight }}
                    />
                  </span>
                  <span className="w-16 shrink-0 text-right text-[0.75rem]">
                    {listDate(hit.sentAt, i18n.language)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
