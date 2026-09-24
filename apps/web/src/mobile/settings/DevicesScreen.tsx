import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LogOut, Monitor, Smartphone } from 'lucide-react';
import { z } from 'zod';
import { sessionInfoSchema, type SessionInfo } from '@phonemail/shared';
import { api } from '../../shared/api';
import { useErrorText } from '../../shared/errors';
import { intlLocale } from '../../shared/time';
import { RequireUser } from '../MobileShell';
import { Dialog } from '../ui/Dialog';
import { IconButton } from '../ui/IconButton';
import { SkeletonRows } from '../ui/bits';
import { toast } from '../ui/toast';
import { describeDevice } from './device';
import { Row, Section, SettingsPage } from './parts';

export function DevicesScreen() {
  return <RequireUser>{() => <Devices />}</RequireUser>;
}

/** "Active now", "5 minutes ago", "2 days ago". */
function lastActive(iso: string, language: string, t: (key: string) => string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 120) return t('devices.activeNow');
  const format = new Intl.RelativeTimeFormat(intlLocale(language), { numeric: 'auto' });
  if (seconds < 3600) return format.format(-Math.round(seconds / 60), 'minute');
  if (seconds < 86_400) return format.format(-Math.round(seconds / 3600), 'hour');
  return format.format(-Math.round(seconds / 86_400), 'day');
}

/** Settings → Devices: where you're signed in, and signing out the ones you don't recognise. */
function Devices() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const errorText = useErrorText();
  const [confirmAll, setConfirmAll] = useState(false);
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api('/me/sessions', { schema: z.array(sessionInfoSchema) }),
  });

  async function signOut(session: SessionInfo) {
    try {
      await api(`/me/sessions/${session.id}`, { method: 'DELETE' });
      queryClient.setQueryData<SessionInfo[]>(['sessions'], (list) =>
        list?.filter((s) => s.id !== session.id),
      );
      toast(t('devices.signedOut'));
    } catch (err) {
      toast(errorText(err));
    }
  }

  async function signOutOthers() {
    setConfirmAll(false);
    try {
      const { revoked } = await api<{ revoked: number }>('/auth/logout-others', { method: 'POST' });
      queryClient.setQueryData<SessionInfo[]>(['sessions'], (list) =>
        list?.filter((s) => s.current),
      );
      toast(t('devices.signedOutOthers', { count: revoked }));
    } catch (err) {
      toast(errorText(err));
    }
  }

  const list = [...(sessions.data ?? [])].sort((a, b) => Number(b.current) - Number(a.current));
  const others = list.filter((s) => !s.current).length;

  return (
    <SettingsPage title={t('settings.devices')}>
      <Section footer={t('devices.explain')}>
        {sessions.isPending ? (
          <SkeletonRows count={2} />
        ) : (
          <ul>
            {list.map((session) => (
              <li key={session.id} className="flex items-center pr-3">
                <div className="min-w-0 flex-1">
                  <Row
                    icon={session.clientType === 'web' ? Monitor : Smartphone}
                    title={`${t(`devices.client_${session.clientType}`)}${
                      describeDevice(session.userAgent)
                        ? ` · ${describeDevice(session.userAgent)}`
                        : ''
                    }`}
                    subtitle={
                      session.current ? (
                        <span className="font-medium text-brand">{t('devices.thisDevice')}</span>
                      ) : (
                        lastActive(session.lastSeenAt, i18n.language, t)
                      )
                    }
                  />
                </div>
                {!session.current && (
                  <IconButton
                    label={t('devices.signOutOne')}
                    icon={LogOut}
                    onClick={() => void signOut(session)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {others > 0 && (
        <Section>
          <Row
            icon={LogOut}
            title={t('devices.signOutOthers')}
            onClick={() => setConfirmAll(true)}
            danger
          />
        </Section>
      )}

      <Dialog
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        title={t('devices.signOutOthersTitle')}
        actions={[
          { label: t('common.cancel'), onClick: () => setConfirmAll(false) },
          {
            label: t('devices.signOutOthersConfirm'),
            onClick: () => void signOutOthers(),
            danger: true,
          },
        ]}
      >
        <p>{t('devices.signOutOthersBody', { count: others })}</p>
      </Dialog>
    </SettingsPage>
  );
}
