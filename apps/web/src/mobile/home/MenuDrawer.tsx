import { useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Copy, FileText, Home, Monitor, ShieldAlert, Trash2 } from 'lucide-react';
import type { Me } from '@phonemail/shared';
import { api } from '../../shared/api';
import { Avatar, avatarFromMe } from '../ui/Avatar';
import { toast } from '../ui/toast';
import { useFocusTrap } from '../ui/useFocusTrap';

const APP_VERSION = '0.1.0';

/**
 * The left menu (docs/spec/07-mobile-ui.md, "Menu"): who you are, Home
 * (inbox and sent together), Drafts, Spam, Trash, and a way to the web view.
 */
export function MenuDrawer({ open, onClose, me }: { open: boolean; onClose: () => void; me: Me }) {
  const { t } = useTranslation();
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => onClose(), [onClose]);
  useFocusTrap(panel, open, close);

  const counts = useQuery({
    queryKey: ['mailbox-counts'],
    queryFn: () =>
      api<{ inboxUnread: number; spamUnread: number; drafts: number }>('/mailbox-counts'),
    enabled: open,
  });

  const items = [
    { to: '/m', label: t('menu.home'), icon: Home, count: 0 },
    { to: '/m/drafts', label: t('menu.drafts'), icon: FileText, count: counts.data?.drafts ?? 0 },
    {
      to: '/m/spam',
      label: t('menu.spam'),
      icon: ShieldAlert,
      count: counts.data?.spamUnread ?? 0,
    },
    { to: '/m/trash', label: t('menu.trash'), icon: Trash2, count: 0 },
  ];

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(me.address);
      toast(t('common.copied'));
    } catch {
      toast(me.address);
    }
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40">
          <motion.div
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
            onClick={close}
            aria-hidden="true"
          />
          <motion.nav
            ref={panel}
            aria-label={t('menu.label')}
            tabIndex={-1}
            className="absolute inset-y-0 left-0 flex w-[82%] max-w-[320px] flex-col bg-surface shadow-xl outline-none"
            initial={reduceMotion ? { opacity: 0 } : { x: '-100%' }}
            animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { x: '-100%' }}
            transition={{ type: 'tween', duration: reduceMotion ? 0 : 0.2 }}
          >
            <div className="bg-brand px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-5 text-white">
              <Avatar avatar={avatarFromMe(me)} size={56} />
              <p className="mt-3 text-[1.0625rem] font-medium">
                {me.displayName || me.phoneDisplay}
              </p>
              <div className="mt-0.5 flex items-center gap-2">
                <span className="truncate text-[0.875rem] text-white/90">{me.address}</span>
                <button
                  type="button"
                  onClick={copyAddress}
                  aria-label={t('menu.copyAddress')}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-white/10"
                >
                  <Copy size={16} aria-hidden="true" />
                </button>
              </div>
            </div>

            <ul className="flex flex-col py-2">
              {items.map(({ to, label, icon: Icon, count }) => {
                const current = location.pathname === to;
                return (
                  <li key={to}>
                    <Link
                      to={to}
                      onClick={close}
                      aria-current={current ? 'page' : undefined}
                      className={`mx-2 flex min-h-12 items-center gap-5 rounded-full px-4 text-[0.9375rem] ${
                        current ? 'bg-[#d9fdd3] font-medium text-[#0a5c47]' : 'hover:bg-black/5'
                      }`}
                    >
                      <Icon
                        size={22}
                        aria-hidden="true"
                        className={current ? '' : 'text-text-muted'}
                      />
                      <span className="flex-1">{label}</span>
                      {count > 0 && (
                        <span className="text-[0.8125rem] text-text-muted">{count}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="mt-auto border-t border-black/5 px-2 py-3">
              <Link
                to="/mail"
                className="flex min-h-12 items-center gap-5 rounded-full px-4 text-[0.9375rem] hover:bg-black/5"
              >
                <Monitor size={22} aria-hidden="true" className="text-text-muted" />
                {t('nav.switchToDesktop')}
              </Link>
              <p className="px-4 pt-2 text-[0.75rem] text-text-muted">PhoneMail {APP_VERSION}</p>
            </div>
          </motion.nav>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
