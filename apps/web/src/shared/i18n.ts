import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LANGUAGE, LANGUAGES, type Language } from '@phonemail/shared';
import en from '../locales/en.json';
import hi from '../locales/hi.json';
import ta from '../locales/ta.json';

const STORAGE_KEY = 'pm.language';

export const resources = {
  en: { translation: en },
  hi: { translation: hi },
  ta: { translation: ta },
};

function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/** The saved choice, if the browser lets us read it. */
function savedLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isLanguage(saved) ? saved : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

/** Switches the UI language at once, remembers it, and keeps <html lang> right for screen readers. */
export async function changeLanguage(language: Language) {
  await i18n.changeLanguage(language);
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Private mode or blocked storage: the choice still applies for this visit.
  }
}

i18n.on('languageChanged', (language) => {
  document.documentElement.lang = language;
});

void i18n.use(initReactI18next).init({
  resources,
  lng: savedLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: { escapeValue: false }, // React already escapes output.
});

export default i18n;
