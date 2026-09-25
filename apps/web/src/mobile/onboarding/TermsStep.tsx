import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { LegalContent } from '../../shared/Legal';
import { BottomSheet } from '../ui/BottomSheet';
import { PrimaryButton } from '../ui/bits';
import { useOnboarding } from './store';

/** A phone with an envelope flying into its chat: the idea of PhoneMail in one picture. */
function TermsIllustration() {
  return (
    <svg width="220" height="200" viewBox="0 0 220 200" aria-hidden="true">
      <circle cx="110" cy="100" r="92" fill="#d9fdd3" />
      <rect
        x="72"
        y="28"
        width="76"
        height="144"
        rx="14"
        fill="#fff"
        stroke="#008069"
        strokeWidth="4"
      />
      <rect x="84" y="50" width="52" height="16" rx="8" fill="#e7f5ef" />
      <rect x="92" y="74" width="44" height="16" rx="8" fill="#d9fdd3" />
      <rect x="84" y="98" width="40" height="16" rx="8" fill="#e7f5ef" />
      <circle cx="110" cy="156" r="5" fill="#008069" />
      <g transform="translate(138 112) rotate(-14)">
        <rect width="58" height="40" rx="6" fill="#008069" />
        <path
          d="M4 5l25 19 25-19"
          fill="none"
          stroke="#fff"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

/** Screen 2: the Terms. Both links open in a sheet; the button accepts them. */
export function TermsStep() {
  const { t } = useTranslation();
  const acceptTerms = useOnboarding((s) => s.acceptTerms);
  const [sheet, setSheet] = useState<'terms' | 'privacy' | null>(null);

  const link = (kind: 'terms' | 'privacy') => (
    <button
      type="button"
      onClick={() => setSheet(kind)}
      className="font-medium text-link underline-offset-2 hover:underline"
    />
  );

  return (
    <main className="flex min-h-dvh flex-col items-center px-6 pt-14 pb-8 text-center">
      <TermsIllustration />
      <h1 className="mt-8 text-[1.375rem] font-medium">{t('onboarding.welcome')}</h1>
      <p className="mt-4 text-[0.9375rem] text-text-muted">
        <Trans
          i18nKey="onboarding.termsText"
          components={{ privacy: link('privacy'), terms: link('terms') }}
        />
      </p>

      <div className="mt-auto w-full pt-8">
        <PrimaryButton onClick={acceptTerms}>{t('onboarding.agree')}</PrimaryButton>
      </div>

      <BottomSheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        title={sheet === 'privacy' ? t('routes.privacy') : t('routes.terms')}
      >
        {sheet && <LegalContent kind={sheet} />}
      </BottomSheet>
    </main>
  );
}
