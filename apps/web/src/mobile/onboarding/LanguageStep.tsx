import { useTranslation } from 'react-i18next';
import { LANGUAGES, type Language } from '@phonemail/shared';
import { changeLanguage } from '../../shared/i18n';
import { LANGUAGE_NAMES } from '../../shared/LanguageSelect';
import { Logo } from '../../shared/Logo';
import { PrimaryButton } from '../ui/bits';
import { useOnboarding } from './store';

const ENGLISH_NAMES: Record<Language, string> = { en: 'English', hi: 'Hindi', ta: 'Tamil' };

/** Screen 1: choose a language. The whole app switches the moment you tap one. */
export function LanguageStep() {
  const { t, i18n } = useTranslation();
  const go = useOnboarding((s) => s.go);

  return (
    <main className="flex min-h-dvh flex-col px-6 pt-14 pb-8">
      <div className="flex flex-col items-center text-center">
        <Logo size={72} />
        <h1 className="mt-6 text-[1.375rem] font-medium">{t('onboarding.welcome')}</h1>
        <p className="mt-2 text-text-muted">{t('onboarding.chooseLanguage')}</p>
      </div>

      <div role="radiogroup" aria-label={t('language.label')} className="mt-8 flex flex-col">
        {LANGUAGES.map((code) => {
          const selected = i18n.language === code;
          return (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => void changeLanguage(code)}
              className="flex min-h-14 items-center gap-4 rounded-xl px-3 text-left hover:bg-black/5"
            >
              <span
                aria-hidden="true"
                className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                  selected ? 'border-brand' : 'border-text-muted'
                }`}
              >
                {selected && <span className="h-2.5 w-2.5 rounded-full bg-brand" />}
              </span>
              <span className="flex flex-col">
                <span lang={code} className="text-[1.0625rem]">
                  {LANGUAGE_NAMES[code]}
                </span>
                {code !== 'en' && (
                  <span className="text-[0.875rem] text-text-muted">{ENGLISH_NAMES[code]}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-auto pt-8">
        <PrimaryButton onClick={() => go('terms')}>{t('onboarding.next')}</PrimaryButton>
      </div>
    </main>
  );
}
