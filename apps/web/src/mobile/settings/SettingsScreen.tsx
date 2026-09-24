import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  AtSign,
  Bell,
  CircleHelp,
  Globe,
  KeyRound,
  LogOut,
  MonitorSmartphone,
  Shield,
} from 'lucide-react';
import { LANGUAGES, type Language, type Me } from '@phonemail/shared';
import { changeLanguage } from '../../shared/i18n';
import { LANGUAGE_NAMES } from '../../shared/LanguageSelect';
import { useConfig } from '../../shared/useConfig';
import { useSignOut } from '../../shared/session';
import { RequireUser } from '../MobileShell';
import { Avatar, avatarFromMe } from '../ui/Avatar';
import { BottomSheet } from '../ui/BottomSheet';
import { Dialog } from '../ui/Dialog';
import { Row, Section, SettingsPage, useUpdateMe } from './parts';

export function SettingsScreen() {
  return <RequireUser>{(me) => <Settings me={me} />}</RequireUser>;
}

/** Settings (docs/spec/07-mobile-ui.md, "Settings"): the profile card on top, then one row per area. */
function Settings({ me }: { me: Me }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const config = useConfig();
  const signOut = useSignOut();
  const updateMe = useUpdateMe();
  const [languageOpen, setLanguageOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const current = (LANGUAGES as readonly string[]).includes(i18n.language)
    ? (i18n.language as Language)
    : 'en';

  async function pickLanguage(language: Language) {
    setLanguageOpen(false);
    await changeLanguage(language);
    await updateMe({ language });
  }

  async function logOut() {
    setConfirmLogout(false);
    await signOut();
    navigate('/m/welcome', { replace: true });
  }

  const showPassword = config.data?.authMode === 'password' || me.hasPassword;

  return (
    <SettingsPage title={t('settings.title')} back="/m">
      <Section>
        <button
          type="button"
          onClick={() => navigate('/m/settings/profile')}
          className="flex w-full items-center gap-4 px-6 py-4 text-left hover:bg-black/[0.03]"
        >
          <Avatar avatar={avatarFromMe(me)} size={64} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[1.25rem]">{me.displayName || me.phoneDisplay}</span>
            <span className="truncate text-[0.875rem] text-text-muted">
              {me.about || me.address}
            </span>
          </span>
          <span className="sr-only">{t('settings.editProfile')}</span>
        </button>
      </Section>

      <Section>
        <Row
          icon={AtSign}
          title={t('settings.aliases')}
          subtitle={t('settings.aliasesHint')}
          onClick={() => navigate('/m/settings/aliases')}
          chevron
        />
        <Row
          icon={Globe}
          title={t('language.label')}
          subtitle={LANGUAGE_NAMES[current]}
          onClick={() => setLanguageOpen(true)}
        />
        <Row
          icon={Bell}
          title={t('settings.notifications')}
          subtitle={t('settings.notificationsHint')}
          onClick={() => navigate('/m/settings/notifications')}
          chevron
        />
        <Row
          icon={Shield}
          title={t('settings.privacy')}
          subtitle={t('settings.privacyHint')}
          onClick={() => navigate('/m/settings/privacy')}
          chevron
        />
        <Row
          icon={MonitorSmartphone}
          title={t('settings.devices')}
          subtitle={t('settings.devicesHint')}
          onClick={() => navigate('/m/settings/devices')}
          chevron
        />
        {showPassword && (
          <Row
            icon={KeyRound}
            title={t('settings.password')}
            subtitle={me.hasPassword ? t('settings.passwordChange') : t('settings.passwordSet')}
            onClick={() => navigate('/m/settings/password')}
            chevron
          />
        )}
        <Row
          icon={CircleHelp}
          title={t('settings.help')}
          subtitle={t('settings.helpHint')}
          onClick={() => navigate('/m/settings/help')}
          chevron
        />
      </Section>

      <Section>
        <Row
          icon={LogOut}
          title={t('settings.logOut')}
          onClick={() => setConfirmLogout(true)}
          danger
        />
      </Section>

      <BottomSheet
        open={languageOpen}
        onClose={() => setLanguageOpen(false)}
        title={t('language.label')}
      >
        <ul role="radiogroup" aria-label={t('language.label')} className="-mx-5">
          {LANGUAGES.map((code) => (
            <li key={code}>
              <button
                type="button"
                role="radio"
                aria-checked={code === current}
                lang={code}
                onClick={() => void pickLanguage(code)}
                className="flex min-h-14 w-full items-center gap-4 px-5 text-left text-[1rem] hover:bg-black/[0.03]"
              >
                <span
                  aria-hidden="true"
                  className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                    code === current ? 'border-brand' : 'border-text-muted'
                  }`}
                >
                  {code === current && <span className="h-2.5 w-2.5 rounded-full bg-brand" />}
                </span>
                {LANGUAGE_NAMES[code]}
              </button>
            </li>
          ))}
        </ul>
      </BottomSheet>

      <Dialog
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        title={t('settings.logOutTitle')}
        actions={[
          { label: t('common.cancel'), onClick: () => setConfirmLogout(false) },
          { label: t('settings.logOut'), onClick: () => void logOut(), danger: true },
        ]}
      >
        <p>{t('settings.logOutBody')}</p>
      </Dialog>
    </SettingsPage>
  );
}
