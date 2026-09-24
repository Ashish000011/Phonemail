import { useTranslation } from 'react-i18next';

/**
 * Short, plain-language Terms and Privacy text (docs/spec/08-web-ui.md),
 * shown in the onboarding sheets and on /terms and /privacy.
 */
const TERMS_KEYS = ['what', 'free', 'use', 'content', 'demo', 'changes'] as const;
const PRIVACY_KEYS = ['stored', 'sms', 'noAds', 'sharing', 'security', 'deletion'] as const;

export function LegalContent({ kind }: { kind: 'terms' | 'privacy' }) {
  const { t } = useTranslation();
  const keys = kind === 'terms' ? TERMS_KEYS : PRIVACY_KEYS;
  return (
    <div className="flex flex-col gap-3 text-[0.9375rem] leading-relaxed text-text">
      <p className="text-text-muted">{t(`legal.${kind}.intro`)}</p>
      <ul className="flex list-disc flex-col gap-2 pl-5">
        {keys.map((key) => (
          <li key={key}>{t(`legal.${kind}.${key}`)}</li>
        ))}
      </ul>
      <p className="text-[0.8125rem] text-text-muted">{t('legal.updated')}</p>
    </div>
  );
}
