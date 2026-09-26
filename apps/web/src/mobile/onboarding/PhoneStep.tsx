import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Search, Sparkles } from 'lucide-react';
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { authResultSchema, otpRequestResponseSchema, type Me } from '@phonemail/shared';
import { api } from '../../shared/api';
import { countryList } from '../../shared/countries';
import { useErrorText } from '../../shared/errors';
import { useConfig } from '../../shared/useConfig';
import { useCountdown } from '../../shared/useCountdown';
import { BottomSheet, SheetActions } from '../ui/BottomSheet';
import { Dialog } from '../ui/Dialog';
import { PrimaryButton } from '../ui/bits';
import { PERMISSION_KEYS, rememberAnswer, rememberedAnswer, useOnboarding } from './store';

const underline =
  'border-0 border-b-2 border-brand bg-transparent px-1 py-2 text-[1.0625rem] outline-none focus:border-b-[3px]';

/** Screen 3: the phone number (pre-filled when we can, always editable). */
export function PhoneStep({ onSignedIn }: { onSignedIn: (user: Me) => void }) {
  const { t, i18n } = useTranslation();
  const errorText = useErrorText();
  const config = useConfig();
  const location = useLocation();
  const passwordMode = config.data?.authMode === 'password';
  const { country, number, setPhone, codeSent } = useOnboarding();
  const countdown = useCountdown();

  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  // The number from the welcome SMS link (?phone=9876543210), read once on arrival.
  const [prefill] = useState(() => {
    const fromLink = new URLSearchParams(location.search).get('phone');
    const parsed = fromLink ? parsePhoneNumberFromString(fromLink, 'IN') : undefined;
    return parsed?.isValid() && parsed.country
      ? { country: parsed.country, number: parsed.nationalNumber }
      : null;
  });
  // Without a pre-filled number, offer to find it (once; "Not now" is remembered).
  const [sheet, setSheet] = useState<'country' | 'whatsMyNumber' | 'findNumber' | null>(() =>
    !prefill && !number && rememberedAnswer(PERMISSION_KEYS.findNumber) === null
      ? 'findNumber'
      : null,
  );
  const [confirm, setConfirm] = useState<{ e164: string; display: string } | null>(null);
  const [countryQuery, setCountryQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const countries = useMemo(() => countryList(i18n.language), [i18n.language]);
  const selected = countries.find((c) => c.code === country) ?? countries[0];

  useEffect(() => {
    if (prefill) setPhone(prefill.country, prefill.number);
  }, [prefill, setPhone]);

  const requestCode = useMutation({
    mutationFn: (e164: string) =>
      api('/auth/otp/request', {
        method: 'POST',
        body: { phone: e164 },
        schema: otpRequestResponseSchema,
      }),
    onSuccess: (result) => codeSent(result.phoneE164, result.demoCode, result.resendAfterSeconds),
    onError: (err) => {
      setError(errorText(err));
      const seconds = Number(
        (err as { details?: { retryAfterSeconds?: number } }).details?.retryAfterSeconds,
      );
      if (seconds > 0) countdown.start(seconds);
    },
  });

  const passwordLogin = useMutation({
    mutationFn: (e164: string) =>
      api('/auth/password/login', {
        method: 'POST',
        body: { phone: e164, password, client: 'mobile', tosVersion: config.data?.tosVersion },
        schema: authResultSchema,
      }),
    onSuccess: (result) => onSignedIn(result.user),
    onError: (err) => setError(errorText(err)),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const parsed = parsePhoneNumberFromString(number, country as CountryCode);
    if (!parsed?.isValid()) {
      setError(t('errors.INVALID_PHONE'));
      return;
    }
    if (passwordMode) {
      passwordLogin.mutate(parsed.number);
      return;
    }
    setConfirm({ e164: parsed.number, display: parsed.formatInternational() });
  }

  const busy = requestCode.isPending || passwordLogin.isPending;
  const filteredCountries = countries.filter(
    (c) =>
      c.name.toLowerCase().includes(countryQuery.toLowerCase()) ||
      c.dialCode.startsWith(countryQuery.replace('+', '')),
  );

  return (
    <main className="flex min-h-dvh flex-col px-6 pt-10 pb-8">
      <h1 className="text-center text-[1.25rem] font-medium text-brand">
        {t('onboarding.enterNumber')}
      </h1>
      <p className="mt-4 text-center text-[0.9375rem] text-text-muted">
        {t('onboarding.verifyExplain')}{' '}
        <button
          type="button"
          onClick={() => setSheet('whatsMyNumber')}
          className="text-link hover:underline"
        >
          {t('onboarding.whatsMyNumber')}
        </button>
      </p>

      <form onSubmit={submit} className="mt-8 flex flex-1 flex-col" noValidate>
        <div className="mx-auto flex w-full max-w-[320px] flex-col gap-3">
          <button
            type="button"
            onClick={() => setSheet('country')}
            aria-label={t('onboarding.chooseCountry', { country: selected.name })}
            className="flex items-center justify-between border-b-2 border-brand px-1 py-2 text-[1.0625rem]"
          >
            <span className="flex-1 text-center">{selected.name}</span>
            <ChevronDown size={20} className="text-brand" aria-hidden="true" />
          </button>

          <div className="flex gap-3">
            <span className={`${underline} w-20 text-center`} aria-hidden="true">
              +{selected.dialCode}
            </span>
            <label className="sr-only" htmlFor="onboarding-phone">
              {t('onboarding.phoneLabel', { code: selected.dialCode })}
            </label>
            <input
              ref={inputRef}
              id="onboarding-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              autoFocus
              placeholder={t('onboarding.phonePlaceholder')}
              value={number}
              onChange={(e) => setPhone(country, e.target.value)}
              aria-invalid={Boolean(error)}
              aria-describedby="onboarding-phone-error"
              className={`${underline} min-w-0 flex-1 tracking-wide`}
            />
          </div>

          {prefill && number === prefill.number && (
            <p className="flex items-center justify-center gap-1.5 text-center text-[0.8125rem] text-text-muted">
              <Sparkles size={14} className="shrink-0 text-brand" aria-hidden="true" />
              {t('onboarding.autoDetected')}
            </p>
          )}

          {passwordMode && (
            <>
              <label className="sr-only" htmlFor="onboarding-password">
                {t('portal.passwordLabel')}
              </label>
              <input
                id="onboarding-password"
                type="password"
                autoComplete="current-password"
                placeholder={t('portal.passwordLabel')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={underline}
              />
              <p className="text-[0.8125rem] text-text-muted">{t('onboarding.passwordHint')}</p>
            </>
          )}

          <p
            id="onboarding-phone-error"
            role="alert"
            className="min-h-5 text-center text-[0.875rem] text-danger"
          >
            {error}
            {countdown.secondsLeft > 0 && ` (${countdown.secondsLeft}s)`}
          </p>
        </div>

        <div className="mt-auto pt-8">
          <PrimaryButton
            type="submit"
            disabled={busy || !number.trim() || (passwordMode && !password)}
          >
            {busy ? t('onboarding.pleaseWait') : t('onboarding.next')}
          </PrimaryButton>
        </div>
      </form>

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        actions={[
          {
            label: t('onboarding.edit'),
            onClick: () => {
              setConfirm(null);
              inputRef.current?.focus();
            },
          },
          {
            label: t('onboarding.ok'),
            autoFocus: true,
            onClick: () => {
              if (confirm) requestCode.mutate(confirm.e164);
              setConfirm(null);
            },
          },
        ]}
      >
        <p>{t('onboarding.confirmNumberIntro')}</p>
        <p className="my-3 text-[1.125rem] font-medium text-text" dir="ltr">
          {confirm?.display}
        </p>
        <p>{t('onboarding.confirmNumberQuestion')}</p>
      </Dialog>

      <BottomSheet
        open={sheet === 'findNumber'}
        onClose={() => setSheet(null)}
        title={t('onboarding.findNumberTitle')}
      >
        <p className="text-[0.9375rem] text-text-muted">{t('onboarding.findNumberBody')}</p>
        <SheetActions
          secondary={t('onboarding.notNow')}
          onSecondary={() => {
            rememberAnswer(PERMISSION_KEYS.findNumber, 'no');
            setSheet(null);
          }}
          primary={t('onboarding.continue')}
          onPrimary={() => {
            rememberAnswer(PERMISSION_KEYS.findNumber, 'yes');
            setSheet(null);
            // Focusing the field makes Chrome offer the saved number from the SIM/Google account.
            setTimeout(() => inputRef.current?.focus(), 250);
          }}
        />
      </BottomSheet>

      <BottomSheet
        open={sheet === 'whatsMyNumber'}
        onClose={() => setSheet(null)}
        title={t('onboarding.whatsMyNumber')}
      >
        <p className="text-[0.9375rem] leading-relaxed text-text-muted">
          {t('onboarding.whatsMyNumberBody')}
        </p>
        <SheetActions primary={t('onboarding.ok')} onPrimary={() => setSheet(null)} />
      </BottomSheet>

      <BottomSheet
        open={sheet === 'country'}
        onClose={() => setSheet(null)}
        title={t('onboarding.chooseCountryTitle')}
      >
        <div className="sticky top-0 mb-2 flex items-center gap-2 rounded-full bg-app-bg px-4">
          <Search size={18} className="text-text-muted" aria-hidden="true" />
          <input
            type="search"
            value={countryQuery}
            onChange={(e) => setCountryQuery(e.target.value)}
            placeholder={t('onboarding.searchCountries')}
            aria-label={t('onboarding.searchCountries')}
            data-autofocus
            className="min-h-11 flex-1 bg-transparent outline-none"
          />
        </div>
        <ul className="flex flex-col">
          {filteredCountries.map((c) => (
            <li key={c.code}>
              <button
                type="button"
                onClick={() => {
                  setPhone(c.code, number);
                  setSheet(null);
                  setCountryQuery('');
                }}
                aria-current={c.code === country}
                className="flex min-h-12 w-full items-center justify-between rounded-lg px-2 text-left hover:bg-black/5"
              >
                <span>{c.name}</span>
                <span className="text-text-muted">+{c.dialCode}</span>
              </button>
            </li>
          ))}
        </ul>
      </BottomSheet>
    </main>
  );
}
