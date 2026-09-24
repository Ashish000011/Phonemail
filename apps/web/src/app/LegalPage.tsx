import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LegalContent } from '../shared/Legal';
import { LanguageSelect } from '../shared/LanguageSelect';
import { Logo } from '../shared/Logo';
import { useDocumentTitle } from '../shared/useDocumentTitle';

/** /terms and /privacy: short, plain-language pages (docs/spec/08-web-ui.md). */
export function LegalPage({ kind }: { kind: 'terms' | 'privacy' }) {
  const { t } = useTranslation();
  const title = t(kind === 'terms' ? 'routes.terms' : 'routes.privacy');
  useDocumentTitle(title);
  return (
    <div className="min-h-dvh bg-app-bg px-4 py-10">
      <main className="mx-auto max-w-2xl rounded-2xl bg-surface p-6 shadow-sm sm:p-10">
        <Link to="/" className="inline-flex items-center gap-2 text-brand">
          <Logo size={32} />
          <span className="font-medium">{t('app.name')}</span>
        </Link>
        <h1 className="mt-6 mb-4 text-2xl font-medium">{title}</h1>
        <LegalContent kind={kind} />
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-black/5 pt-4 text-sm">
          <Link
            to={kind === 'terms' ? '/privacy' : '/terms'}
            className="text-brand hover:underline"
          >
            {t(kind === 'terms' ? 'routes.privacy' : 'routes.terms')}
          </Link>
          <LanguageSelect />
        </div>
      </main>
    </div>
  );
}
