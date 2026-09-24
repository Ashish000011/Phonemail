import { useTranslation } from 'react-i18next';
import { LANGUAGES, type Language } from '@phonemail/shared';
import { changeLanguage } from './i18n';

/** Native names, so people can find their language without reading English. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  hi: 'हिन्दी',
  ta: 'தமிழ்',
};

export function LanguageSelect() {
  const { t, i18n } = useTranslation();
  return (
    <label className="inline-flex items-center gap-2 text-sm text-text-muted">
      {t('language.label')}
      <select
        className="rounded-md border border-black/10 bg-surface px-2 py-1 text-text"
        value={i18n.language}
        onChange={(event) => void changeLanguage(event.target.value as Language)}
      >
        {LANGUAGES.map((code) => (
          <option key={code} value={code} lang={code}>
            {LANGUAGE_NAMES[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
