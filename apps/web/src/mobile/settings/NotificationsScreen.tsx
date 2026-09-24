import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BellRing, Contact, MessageSquareText } from 'lucide-react';
import { RequireUser } from '../MobileShell';
import { notificationsSupported } from '../home/NotificationCard';
import { contactPickerSupported, pickAndShareContacts } from '../onboarding/contacts';
import { setSoundEnabled, soundEnabled } from '../sound';
import { toast } from '../ui/toast';
import { Row, Section, SettingsPage, ToggleRow } from './parts';

export function NotificationsScreen() {
  return <RequireUser>{() => <Notifications />}</RequireUser>;
}

/**
 * Settings → Notifications: the SMS rule in one sentence, the in-app sound,
 * and the two permission prompts again (for people who said "Not now").
 */
function Notifications() {
  const { t } = useTranslation();
  const [sound, setSound] = useState(soundEnabled);
  const [permission, setPermission] = useState(() =>
    notificationsSupported() ? Notification.permission : 'unsupported',
  );

  async function askNotifications() {
    const answer = await Notification.requestPermission();
    setPermission(answer);
    toast(answer === 'granted' ? t('notifications.on') : t('notifications.blocked'));
  }

  async function shareContacts() {
    try {
      const saved = await pickAndShareContacts();
      toast(t('notifications.contactsShared', { count: saved }));
    } catch {
      // Closed the picker: nothing to say.
    }
  }

  return (
    <SettingsPage title={t('settings.notifications')}>
      <Section>
        <Row
          icon={MessageSquareText}
          title={t('notifications.smsTitle')}
          subtitle={t('notifications.smsRule')}
        />
      </Section>

      <Section>
        <ToggleRow
          title={t('notifications.sound')}
          subtitle={t('notifications.soundHint')}
          checked={sound}
          onChange={(on) => {
            setSound(on);
            setSoundEnabled(on);
          }}
        />
      </Section>

      <Section title={t('notifications.permissions')}>
        <Row
          icon={BellRing}
          title={t('notifications.browser')}
          subtitle={
            permission === 'granted'
              ? t('notifications.stateOn')
              : permission === 'denied'
                ? t('notifications.stateBlocked')
                : permission === 'unsupported'
                  ? t('notifications.stateUnsupported')
                  : t('notifications.stateAsk')
          }
          onClick={permission === 'default' ? () => void askNotifications() : undefined}
        />
        <Row
          icon={Contact}
          title={t('notifications.contacts')}
          subtitle={
            contactPickerSupported()
              ? t('notifications.contactsHint')
              : t('notifications.contactsUnsupported')
          }
          onClick={contactPickerSupported() ? () => void shareContacts() : undefined}
        />
      </Section>
    </SettingsPage>
  );
}
