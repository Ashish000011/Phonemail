import { useRef, useState, type FormEvent, type RefObject } from 'react';
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  File,
  Inbox,
  Maximize2,
  Menu,
  Minimize2,
  Minus,
  OctagonAlert,
  Pencil,
  Search,
  Send,
  Settings,
  Smartphone,
  Star,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { z } from 'zod';
import type { Me } from '@phonemail/shared';
import { api } from '../shared/api';
import { Logo } from '../shared/Logo';
import { useMe, useSignOut } from '../shared/session';
import { Composer } from '../mobile/compose/Composer';
import { PasswordForm } from '../mobile/settings/PasswordForm';
import { Avatar, avatarFromMe } from '../mobile/ui/Avatar';
import { Dialog } from '../mobile/ui/Dialog';
import { IconButton } from '../mobile/ui/IconButton';
import { OverflowMenu } from '../mobile/ui/OverflowMenu';
import { ToastHost } from '../mobile/ui/toast';
import { useHotkeys } from './hotkeys';
import { useWebRealtime } from './live';
import { useWeb } from './store';

const countsSchema = z.object({
  inboxUnread: z.number(),
  spamUnread: z.number(),
  drafts: z.number(),
});

/** Unread and draft counts for the navigation, shared by every screen that shows them. */
export function useCounts() {
  return useQuery({
    queryKey: ['mailbox-counts'],
    queryFn: () => api('/mailbox-counts', { schema: countsSchema }),
  });
}

/**
 * Everything under /mail: the Gmail-style web client (docs/spec/08-web-ui.md).
 * Signed-out visitors go to /login and come back to the page they asked for.
 */
export function WebShell() {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#f6f8fc]" role="status">
        <Logo size={64} />
      </div>
    );
  }
  if (!me.data) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (me.data.mustChangePassword) {
    return (
      <div className="mx-auto min-h-dvh max-w-md bg-surface shadow-sm">
        <PasswordForm me={me.data} forced />
      </div>
    );
  }
  return <MailLayout me={me.data} />;
}

interface NavItem {
  to: string;
  icon: LucideIcon;
  labelKey: string;
  count?: number;
}

function MailLayout({ me }: { me: Me }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const signOut = useSignOut();
  const counts = useCounts();
  const openCompose = useWeb((s) => s.openCompose);
  const [navOpen, setNavOpen] = useState(() => window.innerWidth >= 1024);
  const [helpOpen, setHelpOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const [params] = useSearchParams();
  const currentSearch = location.pathname === '/mail/search' ? (params.get('q') ?? '') : '';
  useWebRealtime();

  useHotkeys({
    c: () => openCompose(),
    '/': () => searchInput.current?.focus(),
    '?': () => setHelpOpen(true),
  });

  const nav: NavItem[] = [
    { to: '/mail/inbox', icon: Inbox, labelKey: 'web.inbox', count: counts.data?.inboxUnread },
    { to: '/mail/starred', icon: Star, labelKey: 'web.starred' },
    { to: '/mail/sent', icon: Send, labelKey: 'web.sent' },
    { to: '/mail/drafts', icon: File, labelKey: 'web.drafts', count: counts.data?.drafts },
    { to: '/mail/spam', icon: OctagonAlert, labelKey: 'web.spam', count: counts.data?.spamUnread },
    { to: '/mail/trash', icon: Trash2, labelKey: 'web.trash' },
  ];

  async function logOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex h-dvh flex-col bg-[#f6f8fc]">
      <header className="flex h-16 shrink-0 items-center gap-2 px-2 sm:px-4">
        <IconButton
          label={navOpen ? t('web.collapseMenu') : t('web.expandMenu')}
          icon={Menu}
          aria-expanded={navOpen}
          aria-controls="mail-nav"
          onClick={() => setNavOpen((open) => !open)}
        />
        <Link to="/mail/inbox" className="mr-4 flex items-center gap-2 rounded-lg pr-2">
          <Logo size={32} />
          <span className="hidden text-[1.375rem] text-text sm:inline">{t('app.name')}</span>
        </Link>
        {/* Keyed by the search in the address bar: leaving search clears the box. */}
        <SearchBox key={currentSearch} initial={currentSearch} inputRef={searchInput} />
        <span className="flex-1" />
        <IconButton
          label={t('routes.settings')}
          icon={Settings}
          onClick={() => navigate('/mail/settings')}
        />
        <OverflowMenu
          label={t('web.account')}
          trigger={<Avatar avatar={avatarFromMe(me)} size={32} />}
          header={
            <>
              <p className="truncate font-medium">{me.displayName || me.phoneDisplay}</p>
              <p className="truncate text-sm text-text-muted">{me.address}</p>
            </>
          }
          items={[
            { label: t('profile.title'), onClick: () => navigate('/mail/settings/profile') },
            { label: t('nav.switchToMobile'), onClick: () => navigate('/m') },
            { label: t('web.shortcuts'), onClick: () => setHelpOpen(true) },
            { label: t('settings.logOut'), onClick: () => void logOut(), danger: true },
          ]}
        />
      </header>

      <div className="block bg-[#fff5c4] px-4 py-2 text-center text-sm md:hidden">
        {t('web.smallScreen')}{' '}
        <Link to="/m" className="font-medium text-brand underline">
          {t('nav.switchToMobile')}
        </Link>
      </div>

      <div className="flex min-h-0 flex-1">
        <nav
          id="mail-nav"
          aria-label={t('web.folders')}
          className={`flex shrink-0 flex-col gap-1 overflow-y-auto pr-2 pb-4 transition-[width] ${
            navOpen ? 'w-64 pl-2' : 'w-[4.5rem] pl-2'
          }`}
        >
          <button
            type="button"
            onClick={() => openCompose()}
            title={navOpen ? undefined : t('web.compose')}
            aria-label={navOpen ? undefined : t('web.compose')}
            className={`mb-3 flex h-14 items-center gap-3 rounded-2xl bg-[#c7f0e6] font-medium text-[#00513f] shadow-sm transition-shadow hover:shadow-md ${
              navOpen ? 'w-36 px-4' : 'w-14 justify-center'
            }`}
          >
            <Pencil size={22} aria-hidden="true" />
            {navOpen && t('web.compose')}
          </button>
          <ul className="flex flex-col">
            {nav.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  title={navOpen ? undefined : t(item.labelKey)}
                  className={({ isActive }) =>
                    `flex h-8 items-center gap-4 rounded-full text-[0.875rem] ${
                      navOpen ? 'pr-4 pl-4' : 'w-12 justify-center'
                    } ${isActive ? 'bg-[#d2f1e8] font-bold text-[#00513f]' : 'hover:bg-black/5'}`
                  }
                >
                  <item.icon size={18} aria-hidden="true" className="shrink-0" />
                  {navOpen ? (
                    <>
                      <span className="flex-1 truncate">{t(item.labelKey)}</span>
                      {item.count ? (
                        <span className="text-[0.75rem] font-bold">
                          {item.count}
                          <span className="sr-only"> {t('web.unreadSuffix')}</span>
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="sr-only">
                      {t(item.labelKey)}
                      {item.count ? ` ${item.count}` : ''}
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
          {navOpen && (
            <Link
              to="/m"
              className="mt-auto flex items-center gap-3 rounded-full px-4 py-2 text-[0.8125rem] text-text-muted hover:bg-black/5"
            >
              <Smartphone size={16} aria-hidden="true" />
              {t('nav.switchToMobile')}
            </Link>
          )}
        </nav>

        <main className="mr-2 mb-2 min-w-0 flex-1 overflow-hidden rounded-2xl bg-surface sm:mr-4 sm:mb-4">
          <Outlet />
        </main>
      </div>

      <ComposeWindow me={me} />
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      <ToastHost />
    </div>
  );
}

/** The wide rounded search box; Enter searches all your mail. */
function SearchBox({
  initial,
  inputRef,
}: {
  initial: string;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [text, setText] = useState(initial);

  function submit(event: FormEvent) {
    event.preventDefault();
    const q = text.trim();
    if (q) navigate(`/mail/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <form
      role="search"
      onSubmit={submit}
      className="flex h-12 w-full max-w-[720px] items-center rounded-full bg-[#e9eef6] px-2 focus-within:bg-surface focus-within:shadow-md"
    >
      <IconButton label={t('web.search')} icon={Search} type="submit" size={20} />
      <label htmlFor="mail-search" className="sr-only">
        {t('web.searchMail')}
      </label>
      <input
        id="mail-search"
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') e.currentTarget.blur();
        }}
        placeholder={t('web.searchMail')}
        className="h-full min-w-0 flex-1 bg-transparent px-2 text-base outline-none"
      />
      {text && (
        <IconButton label={t('home.clearSearch')} icon={X} size={20} onClick={() => setText('')} />
      )}
    </form>
  );
}

/** Gmail's compose window: bottom right, can be minimized or made full screen. */
function ComposeWindow({ me }: { me: Me }) {
  const { t } = useTranslation();
  const compose = useWeb((s) => s.compose);
  const close = useWeb((s) => s.closeCompose);
  const toggleMinimized = useWeb((s) => s.toggleMinimized);
  const toggleMaximized = useWeb((s) => s.toggleMaximized);
  if (!compose) return null;

  const controls = (
    <>
      <IconButton
        label={compose.minimized ? t('web.restore') : t('web.minimize')}
        icon={Minus}
        size={18}
        onClick={toggleMinimized}
      />
      <IconButton
        label={compose.maximized ? t('web.exitFullScreen') : t('web.fullScreen')}
        icon={compose.maximized ? Minimize2 : Maximize2}
        size={16}
        onClick={toggleMaximized}
      />
    </>
  );

  const frame = compose.maximized
    ? 'fixed inset-x-[5vw] top-[5vh] bottom-[5vh] z-40'
    : compose.minimized
      ? 'fixed right-4 bottom-0 z-40 h-11 w-72'
      : 'fixed right-4 bottom-0 z-40 h-[min(600px,85dvh)] w-[min(560px,calc(100vw-2rem))]';

  return (
    <>
      {compose.maximized && <div className="fixed inset-0 z-30 bg-black/40" aria-hidden="true" />}
      <section
        aria-label={t('routes.compose')}
        className={`${frame} flex flex-col overflow-hidden rounded-t-xl bg-surface shadow-[0_8px_24px_rgba(0,0,0,0.25)] ${
          compose.maximized ? 'rounded-xl' : ''
        }`}
      >
        <Composer
          key={compose.key}
          me={me}
          layout="window"
          target={compose.target}
          windowControls={controls}
          onClosed={close}
          onSent={close}
        />
      </section>
    </>
  );
}

const SHORTCUTS: [string, string][] = [
  ['c', 'web.keyCompose'],
  ['/', 'web.keySearch'],
  ['j / k', 'web.keyNextPrev'],
  ['o / Enter', 'web.keyOpen'],
  ['x', 'web.keySelect'],
  ['r', 'web.keyReply'],
  ['s', 'web.keyStar'],
  ['#', 'web.keyTrash'],
  ['u', 'web.keyBack'],
  ['?', 'web.keyHelp'],
];

function ShortcutHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('web.shortcuts')}
      actions={[{ label: t('onboarding.ok'), onClick: onClose, autoFocus: true }]}
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-text">
        {SHORTCUTS.map(([keys, labelKey]) => (
          <div key={keys} className="contents">
            <dt>
              <kbd className="rounded border border-black/20 bg-app-bg px-1.5 py-0.5 font-mono text-[0.8125rem]">
                {keys}
              </kbd>
            </dt>
            <dd>{t(labelKey)}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
