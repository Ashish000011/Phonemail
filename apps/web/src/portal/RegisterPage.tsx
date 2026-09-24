import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { otpRequestResponseSchema, portalRegisterResponseSchema } from '@phonemail/shared';
import { api, ApiRequestError } from '../shared/api';
import { DemoCodeBanner } from '../shared/DemoCodeBanner';
import { useErrorText } from '../shared/errors';
import { LanguageSelect } from '../shared/LanguageSelect';
import { Logo } from '../shared/Logo';
import { formatPhone, previewAddress } from '../shared/phone';
import { useConfig } from '../shared/useConfig';
import { useCountdown } from '../shared/useCountdown';
import { useDocumentTitle } from '../shared/useDocumentTitle';

/** After a success, the form clears itself for the next person after this long. */
const RESET_AFTER_MS = 4000;

type Step = 'phone' | 'code' | 'done';
type FieldError = { field: 'phone' | 'secret'; text: string } | null;

const inputClass =
  'w-full rounded-lg border border-black/15 bg-surface px-3 py-3 text-base text-text outline-none ' +
  'focus:border-brand focus:ring-2 focus:ring-brand/25 disabled:bg-app-bg disabled:text-text-muted ' +
  'read-only:bg-app-bg aria-invalid:border-danger';

/** Errors about the code or password belong under that field; the rest under the phone. */
const SECRET_ERRORS = new Set([
  'OTP_EXPIRED',
  'OTP_INVALID',
  'OTP_TOO_MANY_ATTEMPTS',
  'PASSWORD_TOO_SHORT',
  'VALIDATION_FAILED',
]);

/**
 * The registration-only portal (docs/spec/08-web-ui.md): exactly two fields,
 * one button, and after each success both fields clear for the next person.
 */
export function RegisterPage() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const config = useConfig();
  const countdown = useCountdown();
  useDocumentTitle(t('routes.register'));

  const passwordMode = config.data?.authMode === 'password';
  const mailDomain = config.data?.mailDomain ?? 'phonemail.com';

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  // The second field: the one-time code, or the password in password mode.
  const [secret, setSecret] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [demoCode, setDemoCode] = useState<string>();
  const [createdAddress, setCreatedAddress] = useState('');
  const [error, setError] = useState<FieldError>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const secretRef = useRef<HTMLInputElement>(null);

  const sendCode = useMutation({
    mutationFn: (value: string) =>
      api('/portal/otp/request', {
        method: 'POST',
        body: { phone: value },
        schema: otpRequestResponseSchema,
      }),
    onSuccess: (result) => {
      setStep('code');
      setSentTo(result.phoneE164);
      setDemoCode(result.demoCode);
      countdown.start(result.resendAfterSeconds);
      setError(null);
      setTimeout(() => secretRef.current?.focus(), 0);
    },
    onError: (err) => setError({ field: 'phone', text: errorText(err) }),
  });

  const register = useMutation({
    mutationFn: (body: { phone: string; code: string } | { phone: string; password: string }) =>
      api('/portal/register', { method: 'POST', body, schema: portalRegisterResponseSchema }),
    onSuccess: (result) => {
      setCreatedAddress(result.address);
      setStep('done');
    },
    onError: (err) => {
      const code = err instanceof ApiRequestError ? err.code : '';
      setError({ field: SECRET_ERRORS.has(code) ? 'secret' : 'phone', text: errorText(err) });
    },
  });

  function resetForm() {
    setStep('phone');
    setPhone('');
    setSecret('');
    setSentTo('');
    setDemoCode(undefined);
    setCreatedAddress('');
    setError(null);
    countdown.reset();
    sendCode.reset();
    register.reset();
    setTimeout(() => phoneRef.current?.focus(), 0);
  }

  // Kiosk behaviour: the success message stays a few seconds, then the form clears.
  useEffect(() => {
    if (step !== 'done') return;
    const timer = setTimeout(resetForm, RESET_AFTER_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (passwordMode) register.mutate({ phone, password: secret });
    else if (step === 'phone') sendCode.mutate(phone);
    else register.mutate({ phone, code: secret });
  }

  function changeNumber() {
    setStep('phone');
    setSecret('');
    setDemoCode(undefined);
    setError(null);
    setTimeout(() => phoneRef.current?.focus(), 0);
  }

  const busy = sendCode.isPending || register.isPending;
  const codeStep = !passwordMode && step === 'code';
  const secretEnabled = passwordMode || codeStep;
  const preview = previewAddress(phone, mailDomain);
  const buttonLabel = sendCode.isPending
    ? t('portal.sending')
    : register.isPending
      ? t('portal.creating')
      : passwordMode || codeStep
        ? t('portal.createAddress')
        : t('portal.sendCode');
  const canSubmit =
    !busy &&
    phone.trim().length > 0 &&
    (step === 'phone' && !passwordMode
      ? true
      : passwordMode
        ? secret.length > 0
        : secret.length === 6);

  return (
    <div className="flex min-h-dvh flex-col bg-app-bg">
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <section
          aria-labelledby="portal-title"
          className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-sm sm:p-8"
        >
          <div className="mb-6 flex flex-col items-center text-center">
            <Logo size={48} />
            <h1 id="portal-title" className="mt-3 text-xl font-medium text-text">
              {t('routes.register')}
            </h1>
            <p className="mt-1 text-sm text-text-muted">{t('portal.subtitle')}</p>
          </div>

          {step === 'done' ? (
            <SuccessPanel address={createdAddress} onAnother={resetForm} />
          ) : (
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
              {demoCode && <DemoCodeBanner code={demoCode} />}

              <div>
                <label htmlFor="portal-phone" className="mb-1 block text-sm font-medium">
                  {t('portal.phoneLabel')}
                </label>
                <input
                  ref={phoneRef}
                  id="portal-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  autoFocus
                  placeholder={t('portal.phonePlaceholder')}
                  value={phone}
                  readOnly={codeStep}
                  onChange={(e) => setPhone(e.target.value)}
                  aria-invalid={error?.field === 'phone'}
                  aria-describedby="portal-phone-hint portal-phone-error"
                  className={inputClass}
                />
                <p id="portal-phone-hint" className="mt-1 text-xs text-text-muted">
                  {preview
                    ? t('portal.addressPreview', { address: preview })
                    : t('portal.phoneHint')}
                </p>
                {codeStep && (
                  <button
                    type="button"
                    onClick={changeNumber}
                    className="mt-1 text-sm font-medium text-brand hover:underline"
                  >
                    {t('portal.changeNumber')}
                  </button>
                )}
                {error?.field === 'phone' && (
                  <p id="portal-phone-error" role="alert" className="mt-1 text-sm text-danger">
                    {error.text}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="portal-secret" className="mb-1 block text-sm font-medium">
                  {passwordMode ? t('portal.passwordLabel') : t('portal.codeLabel')}
                </label>
                {passwordMode ? (
                  <input
                    ref={secretRef}
                    id="portal-secret"
                    type="password"
                    autoComplete="new-password"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    aria-invalid={error?.field === 'secret'}
                    aria-describedby="portal-secret-hint portal-secret-error"
                    className={inputClass}
                  />
                ) : (
                  <input
                    ref={secretRef}
                    id="portal-secret"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="••••••"
                    disabled={!secretEnabled}
                    value={secret}
                    onChange={(e) => setSecret(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    aria-invalid={error?.field === 'secret'}
                    aria-describedby="portal-secret-hint portal-secret-error"
                    className={`${inputClass} tracking-[0.4em]`}
                  />
                )}
                <p id="portal-secret-hint" className="mt-1 text-xs text-text-muted">
                  {passwordMode
                    ? t('portal.passwordHint')
                    : codeStep
                      ? t('portal.codeHint', { phone: formatPhone(sentTo) })
                      : t('portal.codeLocked')}
                </p>
                {error?.field === 'secret' && (
                  <p id="portal-secret-error" role="alert" className="mt-1 text-sm text-danger">
                    {error.text}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={!canSubmit}
                className="min-h-12 rounded-full bg-brand px-4 font-medium text-white transition-colors hover:bg-[#006e5a] disabled:opacity-50"
              >
                {buttonLabel}
              </button>

              {codeStep && (
                <p className="text-center text-sm text-text-muted" aria-live="polite">
                  {countdown.secondsLeft > 0 ? (
                    t('portal.resendIn', { seconds: countdown.secondsLeft })
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => sendCode.mutate(phone)}
                      className="font-medium text-brand hover:underline"
                    >
                      {t('portal.resend')}
                    </button>
                  )}
                </p>
              )}
            </form>
          )}
        </section>
      </main>

      <footer className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-4 pb-6 text-sm text-text-muted">
        <Link to="/terms" className="hover:underline">
          {t('routes.terms')}
        </Link>
        <Link to="/privacy" className="hover:underline">
          {t('routes.privacy')}
        </Link>
        <Link to="/" className="hover:underline">
          {t('portal.openApp')}
        </Link>
        <LanguageSelect />
      </footer>
    </div>
  );
}

function SuccessPanel({ address, onAnother }: { address: string; onAnother: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-4 text-center">
      <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
        <circle cx="28" cy="28" r="28" fill="var(--color-brand)" />
        <path
          d="M17 29l7 7 15-16"
          fill="none"
          stroke="#fff"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div>
        <h2 className="text-lg font-medium">{t('portal.successTitle')}</h2>
        <p className="mt-1 break-words text-sm text-text-muted">
          {t('portal.successBody', { address })}
        </p>
      </div>
      <button
        type="button"
        onClick={onAnother}
        autoFocus
        className="min-h-12 w-full rounded-full bg-brand px-4 font-medium text-white hover:bg-[#006e5a]"
      >
        {t('portal.createAnother')}
      </button>
      <p className="text-xs text-text-muted">{t('portal.resetting')}</p>
    </div>
  );
}
