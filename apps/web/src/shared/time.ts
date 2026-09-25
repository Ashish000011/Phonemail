import type { TFunction } from 'i18next';

/**
 * Dates the WhatsApp way, in the user's language:
 *   today → "10:05 am", yesterday → "Yesterday", this week → "Tuesday",
 *   older → "12/09/2026".
 */
/** Indian conventions for every language: "16/09/2026", "3:09 pm". */
export function intlLocale(language: string): string {
  return `${language.split('-')[0]}-IN`;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

const DAY = 24 * 60 * 60 * 1000;

export function timeOfDay(iso: string, language: string): string {
  return new Intl.DateTimeFormat(intlLocale(language), {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function chatListTime(iso: string, language: string, t: TFunction): string {
  const date = new Date(iso);
  const daysAgo = Math.round((startOfDay(new Date()) - startOfDay(date)) / DAY);
  if (daysAgo <= 0) return timeOfDay(iso, language);
  if (daysAgo === 1) return t('time.yesterday');
  if (daysAgo < 7)
    return new Intl.DateTimeFormat(intlLocale(language), { weekday: 'long' }).format(date);
  return new Intl.DateTimeFormat(intlLocale(language), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

/** Sticky separators in a chat: "Today", "Yesterday", "12 September 2026". */
export function daySeparator(iso: string, language: string, t: TFunction): string {
  const date = new Date(iso);
  const daysAgo = Math.round((startOfDay(new Date()) - startOfDay(date)) / DAY);
  if (daysAgo <= 0) return t('time.today');
  if (daysAgo === 1) return t('time.yesterday');
  return new Intl.DateTimeFormat(intlLocale(language), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function sameDay(a: string, b: string): boolean {
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}

export function fileSize(bytes: number, language: string): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1;
  return `${new Intl.NumberFormat(intlLocale(language), { maximumFractionDigits: digits }).format(value)} ${units[unit]}`;
}

/** Dates in the web client's list, Gmail style: "3:09 pm" today, "12 Sept" this year, "12/09/2025" before. */
export function listDate(iso: string, language: string): string {
  const date = new Date(iso);
  const now = new Date();
  if (sameDay(iso, now.toISOString())) return timeOfDay(iso, language);
  const options: Intl.DateTimeFormatOptions =
    date.getFullYear() === now.getFullYear()
      ? { day: 'numeric', month: 'short' }
      : { day: '2-digit', month: '2-digit', year: 'numeric' };
  return new Intl.DateTimeFormat(intlLocale(language), options).format(date);
}

/** Full date and time for headers: "25 Sept 2026, 3:13 pm". */
export function fullDate(iso: string, language: string): string {
  return new Intl.DateTimeFormat(intlLocale(language), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}
