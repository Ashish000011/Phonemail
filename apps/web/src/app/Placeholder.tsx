import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Logo } from '../shared/Logo';
import { LanguageSelect } from '../shared/LanguageSelect';
import { useConfig } from '../shared/useConfig';

/**
 * Temporary screen for routes that later phases build. It proves the whole
 * chain works: nginx, then the SPA, then /api/config from the API.
 */
export function Placeholder({ titleKey, switchTo }: { titleKey: string; switchTo?: 'm' | 'mail' }) {
  const { t } = useTranslation();
  const config = useConfig();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
      <Logo size={64} label={t('app.name')} />
      <div>
        <h1 className="text-2xl font-medium text-brand">{t(titleKey)}</h1>
        <p className="mt-2 text-text-muted">{t('app.tagline')}</p>
        <p className="mt-1 text-sm text-text-muted">{t('placeholder.comingSoon')}</p>
      </div>

      <p className="rounded-full bg-surface px-4 py-2 text-sm shadow-sm" role="status">
        <span className="font-medium">{t('placeholder.server')}: </span>
        {config.isPending && t('placeholder.checking')}
        {config.isError && <span className="text-danger">{t('placeholder.offline')}</span>}
        {config.data && t('placeholder.online', { domain: config.data.mailDomain })}
        {config.data?.demoMode && (
          <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-xs text-white">
            {t('placeholder.demoMode')}
          </span>
        )}
      </p>

      <LanguageSelect />

      {switchTo && (
        <Link className="text-sm text-brand underline" to={`/${switchTo}`}>
          {t(switchTo === 'm' ? 'nav.switchToMobile' : 'nav.switchToDesktop')}
        </Link>
      )}
    </main>
  );
}
