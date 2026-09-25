import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, type Language, type Me } from '@phonemail/shared';
import { changeLanguage } from '../shared/i18n';
import { LANGUAGE_NAMES } from '../shared/LanguageSelect';
import { useMe } from '../shared/session';
import { useDocumentTitle } from '../shared/useDocumentTitle';
import { Section, useUpdateMe } from '../mobile/settings/parts';
import { AliasesPanel } from '../mobile/settings/AliasesScreen';
import { DevicesPanel } from '../mobile/settings/DevicesScreen';
import { PrivacyPanel } from '../mobile/settings/PrivacyScreen';
import { ProfilePanel } from '../mobile/settings/ProfileScreen';

const TABS = [
  ['general', 'web.tabGeneral'],
  ['profile', 'profile.title'],
  ['addresses', 'web.tabAddresses'],
  ['devices', 'settings.devices'],
  ['legal', 'web.tabLegal'],
] as const;
type Tab = (typeof TABS)[number][0];

/**
 * /mail/settings (docs/spec/08-web-ui.md, "Settings"). The same panels and
 * APIs as the phone's settings, laid out as Gmail-style tabs.
 */
export function WebSettings() {
  const { t } = useTranslation();
  const { tab = 'general' } = useParams();
  const me = useMe();
  useDocumentTitle(t('routes.settings'));
  const current: Tab = TABS.some(([key]) => key === tab) ? (tab as Tab) : 'general';
  if (!me.data) return null;

  return (
    <div className="flex h-full flex-col">
      <h1 className="px-6 pt-5 pb-2 text-[1.375rem]">{t('routes.settings')}</h1>
      <nav aria-label={t('routes.settings')} className="border-b border-black/10 px-4">
        <ul className="flex gap-1 overflow-x-auto">
          {TABS.map(([key, labelKey]) => (
            <li key={key}>
              <Link
                to={`/mail/settings/${key}`}
                className={`block border-b-[3px] px-4 py-3 text-[0.875rem] whitespace-nowrap ${
                  current === key
                    ? 'border-brand font-medium text-brand'
                    : 'border-transparent text-text-muted hover:text-text'
                }`}
                aria-current={current === key ? 'page' : undefined}
              >
                {t(labelKey)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto bg-[#f6f8fc] p-4 sm:p-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 overflow-hidden rounded-2xl">
          {current === 'general' && <GeneralTab me={me.data} />}
          {current === 'profile' && <ProfilePanel me={me.data} />}
          {current === 'addresses' && <AliasesPanel me={me.data} />}
          {current === 'devices' && <DevicesPanel />}
          {current === 'legal' && <LegalTab />}
        </div>
      </div>
    </div>
  );
}

function GeneralTab({ me }: { me: Me }) {
  const { t, i18n } = useTranslation();
  const updateMe = useUpdateMe();
  const current = (LANGUAGES as readonly string[]).includes(i18n.language)
    ? (i18n.language as Language)
    : 'en';

  async function pick(language: Language) {
    await changeLanguage(language);
    await updateMe({ language });
  }

  return (
    <>
      <Section title={t('language.label')}>
        <div
          role="radiogroup"
          aria-label={t('language.label')}
          className="flex flex-wrap gap-2 px-6 pb-5"
        >
          {LANGUAGES.map((code) => (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={code === current}
              lang={code}
              onClick={() => void pick(code)}
              className={`rounded-full border px-5 py-2 text-[0.9375rem] ${
                code === current
                  ? 'border-brand bg-[#d2f1e8] font-medium text-[#00513f]'
                  : 'border-black/15 hover:bg-black/[0.03]'
              }`}
            >
              {LANGUAGE_NAMES[code]}
            </button>
          ))}
        </div>
      </Section>
      <PrivacyPanel me={me} />
    </>
  );
}

function LegalTab() {
  const { t } = useTranslation();
  return (
    <Section>
      <ul className="flex flex-col px-6 py-3">
        <li>
          <Link to="/terms" target="_blank" className="block py-2 text-brand hover:underline">
            {t('routes.terms')}
          </Link>
        </li>
        <li>
          <Link to="/privacy" target="_blank" className="block py-2 text-brand hover:underline">
            {t('routes.privacy')}
          </Link>
        </li>
        <li className="py-2 text-[0.875rem] text-text-muted">
          {t('help.version', { version: __APP_VERSION__ })} · {t('help.aboutBody')}
        </li>
      </ul>
    </Section>
  );
}
