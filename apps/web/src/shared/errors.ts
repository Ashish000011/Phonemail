import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiRequestError } from './api';

/**
 * Turns any error into a translated sentence. The server sends stable codes
 * (INVALID_PHONE, OTP_INVALID, …); the words live in locales/*.json.
 */
export function useErrorText() {
  const { t, i18n } = useTranslation();

  return useCallback(
    (error: unknown): string => {
      if (!(error instanceof ApiRequestError)) {
        // fetch() throws a TypeError when the network is down.
        return t(error instanceof TypeError ? 'errors.NETWORK' : 'errors.generic');
      }
      const details = (error.details ?? {}) as Record<string, unknown>;
      if (error.code === 'RATE_LIMITED') {
        const seconds = Number(details.retryAfterSeconds);
        return seconds > 0 ? t('errors.RATE_LIMITED', { seconds }) : t('errors.RATE_LIMITED_SOON');
      }
      const key = `errors.${error.code}`;
      return i18n.exists(key) ? t(key, details) : t('errors.generic');
    },
    [t, i18n],
  );
}
