import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { CodeXml, FileText, Info, Lock } from 'lucide-react';
import { useConfig } from '../../shared/useConfig';
import { RequireUser } from '../MobileShell';
import { Row, Section, SettingsPage } from './parts';

export function HelpScreen() {
  return <RequireUser>{() => <Help />}</RequireUser>;
}

/** Settings → Help: the legal pages and what this app is. */
function Help() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const config = useConfig();
  const repoUrl = config.data?.repoUrl;

  return (
    <SettingsPage title={t('settings.help')}>
      <Section>
        <Row icon={FileText} title={t('routes.terms')} onClick={() => navigate('/terms')} chevron />
        <Row icon={Lock} title={t('routes.privacy')} onClick={() => navigate('/privacy')} chevron />
      </Section>
      <Section title={t('help.about')}>
        <Row
          icon={Info}
          title={t('help.version', { version: __APP_VERSION__ })}
          subtitle={t('help.aboutBody')}
        />
        {repoUrl && (
          <a
            href={repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-16 items-center gap-5 px-6 py-3 hover:bg-black/[0.03]"
          >
            <CodeXml size={22} aria-hidden="true" className="shrink-0 text-text-muted" />
            <span className="flex min-w-0 flex-col">
              <span className="text-[1rem]">{t('help.github')}</span>
              <span className="truncate text-[0.8125rem] text-text-muted">{repoUrl}</span>
            </span>
          </a>
        )}
      </Section>
    </SettingsPage>
  );
}
