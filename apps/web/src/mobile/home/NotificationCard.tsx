import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BellRing, X } from 'lucide-react';
import { create } from 'zustand';

const DISMISSED_KEY = 'pm.permission.notifications';

/** Set when the first email arrives while the app is open (see live.tsx). */
export const useFirstArrival = create<{ arrived: boolean; mark: () => void }>((set) => ({
  arrived: false,
  mark: () => set({ arrived: true }),
}));

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** Shows a system notification for a new email while the app is in the background. */
export function notifyIfHidden(title: string, body: string) {
  if (!notificationsSupported() || Notification.permission !== 'granted' || !document.hidden)
    return;
  try {
    new Notification(title, { body, icon: '/icons/icon-192.png', tag: 'phonemail-new-email' });
  } catch {
    // Some mobile browsers only allow notifications from a service worker; skip quietly.
  }
}

function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * "Get notified about new emails" (docs/spec/07-mobile-ui.md, "Permissions"):
 * asked in context, the first time an email arrives while the app is open,
 * never on first launch.
 */
export function NotificationCard() {
  const { t } = useTranslation();
  const arrived = useFirstArrival((s) => s.arrived);
  const [hidden, setHidden] = useState(dismissed);

  if (!arrived || hidden || !notificationsSupported() || Notification.permission !== 'default') {
    return null;
  }

  function close(answer: 'yes' | 'no') {
    try {
      localStorage.setItem(DISMISSED_KEY, answer);
    } catch {
      // ignore
    }
    setHidden(true);
  }

  return (
    <div className="mx-4 mb-2 flex items-start gap-3 rounded-2xl bg-[#e7fce3] p-4">
      <BellRing size={22} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
      <div className="flex-1">
        <p className="text-[0.9375rem] font-medium">{t('home.notifyTitle')}</p>
        <p className="mt-0.5 text-[0.8125rem] text-text-muted">{t('home.notifyBody')}</p>
        <button
          type="button"
          onClick={() => {
            void Notification.requestPermission().finally(() => close('yes'));
          }}
          className="mt-2 min-h-9 rounded-full bg-brand px-4 text-[0.875rem] font-medium text-white"
        >
          {t('home.turnOn')}
        </button>
      </div>
      <button
        type="button"
        onClick={() => close('no')}
        aria-label={t('onboarding.notNow')}
        className="-mt-1 -mr-1 flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/5"
      >
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
