import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { authResultSchema, otpRequestResponseSchema } from '@phonemail/shared';
import { api } from '../shared/api';
import { countryList } from '../shared/countries';
import { DemoCodeBanner } from '../shared/DemoCodeBanner';
import { useErrorText } from '../shared/errors';
import { LanguageSelect } from '../shared/LanguageSelect';
import { Logo } from '../shared/Logo';
import { useMe, useSignedIn } from '../shared/session';
import { useConfig } from '../shared/useConfig';
import { useCountdown } from '../shared/useCountdown';
import { useDocumentTitle } from '../shared/useDocumentTitle';

const inputClass =
  'w-full rounded-lg border border-black/15 bg-surface px-3 py-3 text-base text-text outline-none ' +
  'focus:border-brand focus:ring-2 focus:ring-brand/25 read-only:bg-app-bg aria-invalid:border-danger';

/** Only a path inside the app, so ?next= can't send people to another site. */
function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/mail';
}

/**
 * Web sign-in (docs/spec/08-web-ui.md, "Web login"): one card, one button.
 * The first Next sends a code; the code field then appears under the number,
 * and the same Next signs in (creating the account if the number is new).
 */
export function LoginPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const me = useMe();
  const config = useConfig();
  const signedIn = useSignedIn();
  const errorText = useErrorText();
  const countdown = useCountdown();
  useDocumentTitle(t('routes.login'));

  const countries = useMemo(() => countryList(i18n.language), [i18n.language]);
  const [country, setCountry] = useState<CountryCode>('IN');
  const [number, setNumber] = useState('');
  const [secret, setSecret] = useState('');
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [demoCode, setDemoCode] = useState<string>();
  const [usePassword, setUsePassword] = useState(false);
  const [error, setError] = useState<{ field: 'phone' | 'secret'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const phoneRef = useRef<HTMLInputElement>(null);

  const authMode = config.data?.authMode ?? 'otp';
  const passwordMode = authMode === 'password' || (authMode === 'both' && usePassword);
  const next = safeNext(params.get('next'));

  if (me.data) return <Navigate to={next} replace />;

  function parsed() {
    const phone = parsePhoneNumberFromString(number, country);
    return phone?.isValid() ? phone.number : null;
  }

  async function signIn(path: string, body: Record<string, unknown>) {
    const result = await api(path, {
      method: 'POST',
      body: { ...body, client: 'web', tosVersion: config.data?.tosVersion },
      schema: authResultSchema,
    });
    signedIn(result.user);
    navigate(next, { replace: true });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const e164 = codeSentTo ?? parsed();
    if (!e164) {
      setError({ field: 'phone', text: t('errors.INVALID_PHONE') });
      return;
    }
    setBusy(true);
    try {
      if (passwordMode) {
        await signIn('/auth/password/login', { phone: e164, password: secret });
      } else if (!codeSentTo) {
        const result = await api('/auth/otp/request', {
          method: 'POST',
          body: { phone: e164 },
          schema: otpRequestResponseSchema,
        });
        setCodeSentTo(result.phoneE164);
        setDemoCode(result.demoCode);
        countdown.start(result.resendAfterSeconds);
      } else {
        await signIn('/auth/otp/verify', { phone: e164, code: secret });
      }
    } catch (err) {
      setError({ field: codeSentTo || passwordMode ? 'secret' : 'phone', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!codeSentTo) return;
    setError(null);
    try {
      const result = await api('/auth/otp/request', {
        method: 'POST',
        body: { phone: codeSentTo },
        schema: otpRequestResponseSchema,
      });
      setDemoCode(result.demoCode);
      countdown.start(result.resendAfterSeconds);
    } catch (err) {
      setError({ field: 'secret', text: errorText(err) });
    }
  }

  function editNumber() {
    setCodeSentTo(null);
    setSecret('');
    setDemoCode(undefined);
    setError(null);
    countdown.reset();
    setTimeout(() => phoneRef.current?.focus(), 0);
  }

  const showSecret = passwordMode || codeSentTo !== null;
  const canSubmit =
    !busy &&
    number.trim().length > 0 &&
    (!showSecret || (passwordMode ? secret.length > 0 : secret.length === 6));

  return (
    <div className="flex min-h-dvh flex-col bg-app-bg">
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <section
          aria-labelledby="login-title"
          className="w-full max-w-md rounded-3xl bg-surface p-8 shadow-sm sm:p-10"
        >
          <div className="mb-8 flex flex-col items-center text-center">
            <Logo size={48} />
            <h1 id="login-title" className="mt-4 text-2xl text-text">
              {t('login.title')}
            </h1>
            <p className="mt-2 text-sm text-text-muted">{t('login.subtitle')}</p>
          </div>

          <form onSubmit={submit} noValidate className="flex flex-col gap-5">
            {demoCode && <DemoCodeBanner code={demoCode} />}

            <div>
              <label htmlFor="login-phone" className="mb-1 block text-sm font-medium">
                {t('portal.phoneLabel')}
              </label>
              <div className="flex gap-2">
                <label htmlFor="login-country" className="sr-only">
                  {t('onboarding.chooseCountry')}
                </label>
                <select
                  id="login-country"
                  value={country}
                  disabled={codeSentTo !== null}
                  onChange={(e) => setCountry(e.target.value as CountryCode)}
                  className="w-28 shrink-0 rounded-lg border border-black/15 bg-surface px-2 text-base disabled:bg-app-bg"
                >
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} +{c.dialCode} {c.code === country ? '' : `· ${c.name}`}
                    </option>
                  ))}
                </select>
                <input
                  ref={phoneRef}
                  id="login-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  autoFocus
                  placeholder={t('portal.phonePlaceholder')}
                  value={number}
                  readOnly={codeSentTo !== null}
                  onChange={(e) => setNumber(e.target.value)}
                  aria-invalid={error?.field === 'phone'}
                  aria-describedby={error?.field === 'phone' ? 'login-phone-error' : undefined}
                  className={inputClass}
                />
              </div>
              {codeSentTo && (
                <button
                  type="button"
                  onClick={editNumber}
                  className="mt-1 text-sm font-medium text-brand hover:underline"
                >
                  {t('onboarding.edit')}
                </button>
              )}
              {error?.field === 'phone' && (
                <p id="login-phone-error" role="alert" className="mt-1 text-sm text-danger">
                  {error.text}
                </p>
              )}
            </div>

            {showSecret && (
              <div>
                <label htmlFor="login-secret" className="mb-1 block text-sm font-medium">
                  {passwordMode ? t('portal.passwordLabel') : t('portal.codeLabel')}
                </label>
                <input
                  id="login-secret"
                  // The code field appears once the code is sent: go straight to it.
                  autoFocus={!passwordMode}
                  type={passwordMode ? 'password' : 'text'}
                  inputMode={passwordMode ? undefined : 'numeric'}
                  autoComplete={passwordMode ? 'current-password' : 'one-time-code'}
                  maxLength={passwordMode ? 200 : 6}
                  placeholder={passwordMode ? undefined : '••••••'}
                  value={secret}
                  onChange={(e) =>
                    setSecret(
                      passwordMode ? e.target.value : e.target.value.replace(/\D/g, '').slice(0, 6),
                    )
                  }
                  aria-invalid={error?.field === 'secret'}
                  aria-describedby="login-secret-hint login-secret-error"
                  className={`${inputClass} ${passwordMode ? '' : 'tracking-[0.4em]'}`}
                />
                {!passwordMode && codeSentTo && (
                  <p
                    id="login-secret-hint"
                    className="mt-1 text-xs text-text-muted"
                    aria-live="polite"
                  >
                    {countdown.secondsLeft > 0 ? (
                      t('portal.resendIn', { seconds: countdown.secondsLeft })
                    ) : (
                      <button
                        type="button"
                        onClick={() => void resend()}
                        className="font-medium text-brand hover:underline"
                      >
                        {t('portal.resend')}
                      </button>
                    )}
                  </p>
                )}
                {error?.field === 'secret' && (
                  <p id="login-secret-error" role="alert" className="mt-1 text-sm text-danger">
                    {error.text}
                  </p>
                )}
              </div>
            )}

            <p className="text-center text-xs text-text-muted">
              {t('login.termsBefore')}
              <a href="/terms" target="_blank" rel="noopener" className="text-brand underline">
                {t('routes.terms')}
              </a>
              {t('login.termsAfter')}
            </p>

            <button
              type="submit"
              disabled={!canSubmit}
              className="min-h-12 rounded-full bg-brand px-4 font-medium text-white transition-colors hover:bg-[#006e5a] disabled:opacity-50"
            >
              {busy ? t('onboarding.pleaseWait') : t('onboarding.next')}
            </button>

            {authMode === 'both' && !codeSentTo && (
              <button
                type="button"
                onClick={() => {
                  setUsePassword((v) => !v);
                  setSecret('');
                  setError(null);
                }}
                className="self-center text-sm font-medium text-brand hover:underline"
              >
                {usePassword ? t('login.useCode') : t('login.usePassword')}
              </button>
            )}
          </form>
        </section>
      </main>

      <footer className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-4 pb-6 text-sm text-text-muted">
        <Link to="/terms" className="hover:underline">
          {t('routes.terms')}
        </Link>
        <Link to="/privacy" className="hover:underline">
          {t('routes.privacy')}
        </Link>
        <Link to="/m" className="hover:underline">
          {t('nav.switchToMobile')}
        </Link>
        <LanguageSelect />
      </footer>
    </div>
  );
}
