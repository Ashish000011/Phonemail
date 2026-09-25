import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  blockedSenderSchema,
  colorFor,
  initialsFor,
  type BlockedSender,
  type Me,
} from '@phonemail/shared';
import { api } from '../../shared/api';
import { useErrorText } from '../../shared/errors';
import { RequireUser } from '../MobileShell';
import { Avatar } from '../ui/Avatar';
import { SkeletonRows } from '../ui/bits';
import { toast } from '../ui/toast';
import { Section, SettingsPage, ToggleRow, useUpdateMe } from './parts';

export function PrivacyScreen() {
  const { t } = useTranslation();
  return (
    <RequireUser>
      {(me) => (
        <SettingsPage title={t('settings.privacy')}>
          <PrivacyPanel me={me} />
        </SettingsPage>
      )}
    </RequireUser>
  );
}

/** Settings → Privacy: read receipts, remote images, and the people you blocked. */
export function PrivacyPanel({ me }: { me: Me }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const errorText = useErrorText();
  const updateMe = useUpdateMe();
  const blocked = useQuery({
    queryKey: ['blocked'],
    queryFn: () => api('/me/blocked', { schema: z.array(blockedSenderSchema) }),
  });

  async function unblock(sender: BlockedSender) {
    try {
      await api(`/me/blocked/${sender.id}`, { method: 'DELETE' });
      queryClient.setQueryData<BlockedSender[]>(['blocked'], (list) =>
        list?.filter((b) => b.id !== sender.id),
      );
      toast(t('privacy.unblocked', { name: sender.name }));
    } catch (err) {
      toast(errorText(err));
    }
  }

  return (
    <>
      <Section>
        <ToggleRow
          title={t('privacy.readReceipts')}
          subtitle={t('privacy.readReceiptsHint')}
          checked={me.readReceipts}
          onChange={(readReceipts) => void updateMe({ readReceipts })}
        />
        <ToggleRow
          title={t('privacy.remoteImages')}
          subtitle={t('privacy.remoteImagesHint')}
          checked={me.loadRemoteImages}
          onChange={(loadRemoteImages) => void updateMe({ loadRemoteImages })}
        />
      </Section>

      <Section title={t('privacy.blocked')} footer={t('privacy.blockedHint')}>
        {blocked.isPending ? (
          <SkeletonRows count={2} />
        ) : blocked.data?.length ? (
          <ul>
            {blocked.data.map((sender) => (
              <li key={sender.id} className="flex items-center gap-4 px-6 py-2">
                <Avatar
                  avatar={{
                    kind: 'initials',
                    url: null,
                    initials: initialsFor(sender.name),
                    color: colorFor(sender.address),
                  }}
                  size={40}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{sender.name}</span>
                  <span className="truncate text-[0.8125rem] text-text-muted">
                    {sender.phoneDisplay ?? sender.address}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void unblock(sender)}
                  aria-label={t('privacy.unblockName', { name: sender.name })}
                  className="shrink-0 rounded-full border border-black/15 px-4 py-1.5 text-[0.875rem] font-medium text-brand hover:bg-black/5"
                >
                  {t('privacy.unblock')}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-6 py-3 text-[0.9375rem] text-text-muted">{t('privacy.noneBlocked')}</p>
        )}
      </Section>
    </>
  );
}
