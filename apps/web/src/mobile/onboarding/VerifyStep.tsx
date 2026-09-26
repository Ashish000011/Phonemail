import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'motion/react';
import {
  authResultSchema,
  OTP_TTL_SECONDS,
  otpRequestResponseSchema,
  type Me,
} from '@phonemail/shared';
import { api } from '../../shared/api';
import { DemoCodeBanner } from '../../shared/DemoCodeBanner';
import { useErrorText } from '../../shared/errors';
import { formatPhone } from '../../shared/phone';
import { useConfig } from '../../shared/useConfig';
import { useCountdown } from '../../shared/useCountdown';
import { PrimaryButton } from '../ui/bits';
import { useOnboarding } from './store';

/** "4:05" */
function clock(totalSeconds: number): string {
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

/** WebOTP: Chrome on Android reads the code from the SMS (its last line is "@host #123456"). */
interface OtpCredential extends Credential {
  code: string;
}

/**
 * Screen 4: the code. It fills itself in where the phone allows (WebOTP on
 * Android Chrome, the keyboard's suggestion on iPhone) and submits on the
 * sixth digit.
 */
export function VerifyStep({ onSignedIn }: { onSignedIn: (user: Me) => void }) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const config = useConfig();
  const reduceMotion = useReducedMotion();
  const { phoneE164, demoCode, codeSentAt, resendAfterSeconds, go, codeSent } = useOnboarding();
  const countdown = useCountdown();
  const expiry = useCountdown();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [focused, setFocused] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  // Resend is allowed 30 s after the last code, and the code works for 5
  // minutes; both count from when it was sent, even across a page refresh.
  const startCountdown = countdown.start;
  const startExpiry = expiry.start;
  useEffect(() => {
    const elapsed = codeSentAt ? (Date.now() - codeSentAt) / 1000 : OTP_TTL_SECONDS;
    startCountdown(Math.ceil(resendAfterSeconds - elapsed));
    startExpiry(Math.ceil(OTP_TTL_SECONDS - elapsed));
  }, [codeSentAt, resendAfterSeconds, startCountdown, startExpiry]);

  // Listen for the SMS while this screen is open; stop listening when it closes.
  useEffect(() => {
    if (!('OTPCredential' in window)) return;
    const controller = new AbortController();
    navigator.credentials
      .get({ otp: { transport: ['sms'] }, signal: controller.signal } as CredentialRequestOptions)
      .then((credential) => {
        const received = (credential as OtpCredential | null)?.code;
        if (received) setCode(received);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [codeSentAt]);

  const verify = useMutation({
    mutationFn: (value: string) =>
      api('/auth/otp/verify', {
        method: 'POST',
        body: {
          phone: phoneE164,
          code: value,
          client: 'mobile',
          tosVersion: config.data?.tosVersion,
        },
        schema: authResultSchema,
      }),
    onSuccess: (result) => {
      setVerified(true);
      setTimeout(() => onSignedIn(result.user), reduceMotion ? 300 : 900);
    },
    onError: (err) => {
      setError(errorText(err));
      setCode('');
      inputRef.current?.focus();
    },
  });

  const resend = useMutation({
    mutationFn: () =>
      api('/auth/otp/request', {
        method: 'POST',
        body: { phone: phoneE164 },
        schema: otpRequestResponseSchema,
      }),
    onSuccess: (result) => {
      setError(null);
      codeSent(result.phoneE164, result.demoCode, result.resendAfterSeconds);
    },
    onError: (err) => setError(errorText(err)),
  });

  // Submit as soon as the sixth digit is in.
  useEffect(() => {
    if (code.length === 6 && !verify.isPending && !verified) verify.mutate(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const display = phoneE164 ? formatPhone(phoneE164) : '';
  const expired = Boolean(codeSentAt) && expiry.secondsLeft === 0;

  if (verified) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4" role="status">
        <motion.svg
          width="96"
          height="96"
          viewBox="0 0 96 96"
          initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          aria-hidden="true"
        >
          <circle cx="48" cy="48" r="48" fill="var(--color-brand)" />
          <path
            d="M28 50l13 13 27-29"
            fill="none"
            stroke="#fff"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </motion.svg>
        <p className="text-[1.125rem] font-medium">{t('onboarding.verified')}</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col px-6 pt-10 pb-8">
      <h1 className="text-center text-[1.25rem] font-medium text-brand">
        {t('onboarding.verifying')}
      </h1>
      <p className="mt-4 text-center text-[0.9375rem] text-text-muted">
        {t('onboarding.waitingForSms', { phone: display })}{' '}
        <button type="button" onClick={() => go('phone')} className="text-link hover:underline">
          {t('onboarding.wrongNumber')}
        </button>
      </p>

      {demoCode && (
        <div className="mx-auto mt-5 w-full max-w-[320px]">
          <DemoCodeBanner code={demoCode} />
        </div>
      )}

      <div className="relative mx-auto mt-8">
        <label htmlFor="onboarding-code" className="sr-only">
          {t('onboarding.codeLabel')}
        </label>
        <input
          ref={inputRef}
          id="onboarding-code"
          value={code}
          onChange={(e) => {
            setError(null);
            setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          aria-invalid={Boolean(error)}
          aria-describedby="onboarding-code-error"
          className="absolute inset-0 z-10 h-full w-full cursor-text bg-transparent text-transparent caret-transparent opacity-0"
        />
        <div aria-hidden="true" className="flex items-center gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <span
              key={i}
              className={`flex h-12 w-9 items-center justify-center border-b-2 text-[1.625rem] ${
                i === 3 ? 'ml-4' : ''
              } ${focused && i === Math.min(code.length, 5) ? 'border-brand' : 'border-text-muted/50'}`}
            >
              {code[i] ?? ''}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-3 text-center text-[0.875rem] text-text-muted">
        {t('onboarding.enterCode')}
      </p>
      {/* Updated every second, so it's not announced; the expired message is. */}
      {codeSentAt && !expired && (
        <p className="mt-1 text-center text-[0.8125rem] text-text-muted">
          {t('onboarding.expiresIn', { time: clock(expiry.secondsLeft) })}
        </p>
      )}
      <p
        id="onboarding-code-error"
        role="alert"
        className="mt-2 min-h-5 text-center text-[0.875rem] text-danger"
      >
        {/* The button says "Please wait…"; this line is only for problems. */}
        {verify.isPending ? null : expired ? t('onboarding.expired') : error}
      </p>

      {/* For codes typed by hand; a detected or pasted code submits by itself. */}
      <div className="mx-auto mt-4 mb-8 w-full max-w-[320px]">
        <PrimaryButton
          type="button"
          disabled={code.length < 6 || verify.isPending || expired}
          onClick={() => verify.mutate(code)}
        >
          {verify.isPending ? t('onboarding.pleaseWait') : t('onboarding.verify')}
        </PrimaryButton>
      </div>

      <section
        aria-labelledby="onboarding-resend-title"
        className="mx-auto mt-auto flex w-full max-w-[320px] flex-col items-center gap-1 rounded-2xl border border-text-muted/25 bg-app-bg px-4 py-4 text-[0.9375rem]"
      >
        <h2 id="onboarding-resend-title" className="font-medium">
          {t('onboarding.didntReceive')}
        </h2>
        {countdown.secondsLeft > 0 ? (
          <p className="text-text-muted" aria-live="polite">
            {t('onboarding.resendIn', { time: clock(countdown.secondsLeft) })}
          </p>
        ) : (
          <button
            type="button"
            disabled={resend.isPending}
            onClick={() => resend.mutate()}
            className="min-h-11 font-medium text-brand"
          >
            {t('onboarding.resendSms')}
          </button>
        )}
        <button
          type="button"
          onClick={() => go('phone')}
          className="min-h-11 text-[0.875rem] text-link"
        >
          {t('onboarding.changeNumber')}
        </button>
      </section>
    </main>
  );
}
