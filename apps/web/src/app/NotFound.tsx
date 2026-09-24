import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';

export function NotFound() {
  const { t } = useTranslation();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-xl font-medium">{t('routes.notFound')}</h1>
      <Link className="text-brand underline" to="/">
        {t('nav.home')}
      </Link>
    </main>
  );
}
