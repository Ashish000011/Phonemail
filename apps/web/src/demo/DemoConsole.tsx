import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  demoSmsSchema,
  demoUserSchema,
  SOCKET_EVENTS,
  type DemoSms,
  type DemoUser,
} from '@phonemail/shared';
import { api } from '../shared/api';
import { useErrorText } from '../shared/errors';
import { createDemoSocket } from '../shared/socket';
import { DemoCodeBanner } from '../shared/DemoCodeBanner';
import { LanguageSelect } from '../shared/LanguageSelect';
import { Logo } from '../shared/Logo';
import { formatPhone } from '../shared/phone';
import { useConfig } from '../shared/useConfig';
import { useDocumentTitle } from '../shared/useDocumentTitle';

/**
 * The judges' toolbox (docs/spec/06, "Demo console"): every SMS and code the
 * app "sent", every account with its SMS-alert status, and a way to send
 * email in from outside. Updates arrive live over Socket.IO; a slow poll is
 * the safety net if the socket drops.
 */
export function DemoConsole() {
  const { t } = useTranslation();
  const config = useConfig();
  const queryClient = useQueryClient();
  useDocumentTitle(t('routes.demo'));
  const demoMode = config.data?.demoMode === true;
  const [live, setLive] = useState(false);

  const sms = useQuery({
    queryKey: ['demo', 'sms'],
    queryFn: () => api('/demo/sms?limit=50', { schema: z.array(demoSmsSchema) }),
    enabled: demoMode,
    refetchInterval: 15_000,
  });
  const users = useQuery({
    queryKey: ['demo', 'users'],
    queryFn: () => api('/demo/users', { schema: z.array(demoUserSchema) }),
    enabled: demoMode,
    refetchInterval: 15_000,
  });

  useEffect(() => {
    if (!demoMode) return;
    const socket = createDemoSocket();
    socket.on('connect', () => setLive(true));
    socket.on('disconnect', () => setLive(false));
    socket.on(SOCKET_EVENTS.demoSms, (item: DemoSms) => {
      queryClient.setQueryData<DemoSms[]>(['demo', 'sms'], (old = []) =>
        [item, ...old.filter((o) => o.id !== item.id)].slice(0, 50),
      );
    });
    socket.on(SOCKET_EVENTS.demoUsers, () => {
      void queryClient.invalidateQueries({ queryKey: ['demo', 'users'] });
    });
    return () => {
      socket.disconnect();
    };
  }, [demoMode, queryClient]);

  if (config.data && !demoMode) {
    return <p className="p-8 text-center text-text-muted">{t('demo.off')}</p>;
  }

  return (
    <div className="min-h-dvh bg-app-bg">
      <header className="flex items-center gap-3 bg-brand px-4 py-3 text-white sm:px-6">
        <Logo size={28} tone="light" />
        <h1 className="text-lg font-medium">{t('routes.demo')}</h1>
        <div className="ml-auto [&_label]:text-white/90">
          <LanguageSelect />
        </div>
      </header>
      <p className="bg-[#fff4d6] px-4 py-2 text-sm sm:px-6" role="note">
        {t('demo.banner')}
      </p>

      <main className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section aria-labelledby="feed-title" className="rounded-xl bg-surface p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="feed-title" className="font-medium">
              {t('demo.feedTitle')}
            </h2>
            <span className="flex items-center gap-1.5 text-xs text-text-muted">
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${live ? 'bg-brand' : 'bg-black/20'}`}
              />
              {live ? t('demo.live') : t('demo.connecting')}
            </span>
          </div>
          {sms.data?.length === 0 && (
            <p className="text-sm text-text-muted">{t('demo.feedEmpty')}</p>
          )}
          <ol className="flex flex-col gap-3" aria-live="polite">
            {sms.data?.map((item) => (
              <SmsItem key={item.id} item={item} />
            ))}
          </ol>
        </section>

        <div className="flex flex-col gap-6">
          <PhoneSimulatorPanel />
          <SendEmailPanel />
          <section aria-labelledby="users-title" className="rounded-xl bg-surface p-4 shadow-sm">
            <h2 id="users-title" className="mb-3 font-medium">
              {t('demo.usersTitle')}
            </h2>
            {users.data?.length === 0 ? (
              <p className="text-sm text-text-muted">{t('demo.usersEmpty')}</p>
            ) : (
              <UsersTable users={users.data ?? []} />
            )}
          </section>

          <section aria-labelledby="links-title" className="rounded-xl bg-surface p-4 shadow-sm">
            <h2 id="links-title" className="mb-3 font-medium">
              {t('demo.linksTitle')}
            </h2>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <li>
                <a
                  className="text-brand hover:underline"
                  href={`${window.location.protocol}//${window.location.hostname}:8025`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('demo.linkMailpit')}
                </a>
              </li>
              <li>
                <a
                  className="text-brand hover:underline"
                  href="/api/docs"
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('demo.linkApiDocs')}
                </a>
              </li>
              <li>
                <a
                  className="text-brand hover:underline"
                  href="/api/health"
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('demo.linkHealth')}
                </a>
              </li>
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}

function useTime() {
  const { i18n } = useTranslation();
  return (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(iso));
}

function SmsItem({ item }: { item: DemoSms }) {
  const { t } = useTranslation();
  const time = useTime();
  const code = item.purpose === 'otp' ? item.body.match(/\b(\d{6})\b/)?.[1] : undefined;
  const failed = item.status === 'failed';

  return (
    <li className="rounded-lg border border-black/10 p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
        <time dateTime={item.createdAt}>{time(item.createdAt)}</time>
        <span aria-hidden="true">·</span>
        <span className="font-medium text-text">
          {t('demo.to', { phone: formatPhone(item.toE164) })}
        </span>
        <span className="rounded-full bg-app-bg px-2 py-0.5">
          {t(`demo.purpose.${item.purpose}`)}
        </span>
        <span className="ml-auto">
          {item.provider} ·{' '}
          <span className={failed ? 'font-medium text-danger' : ''}>
            {t(`demo.status.${item.status}`)}
          </span>
        </span>
      </div>
      {code && (
        <div className="mt-2">
          <DemoCodeBanner code={code} />
        </div>
      )}
      <p className="mt-2 text-sm whitespace-pre-wrap break-words">{item.body}</p>
      {item.error && <p className="mt-1 text-xs text-danger">{item.error}</p>}
    </li>
  );
}

function UsersTable({ users }: { users: DemoUser[] }) {
  const { t } = useTranslation();
  const time = useTime();
  const yesNo = (value: boolean) => (value ? t('common.yes') : t('common.no'));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-text-muted">
          <tr>
            <th scope="col" className="py-2 pr-3 font-medium">
              {t('demo.colNumber')}
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              {t('demo.colAddress')}
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              {t('demo.colChannel')}
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              {t('demo.colMobile')}
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              {t('demo.colAlerts')}
            </th>
            <th scope="col" className="py-2 font-medium">
              {t('demo.colCreated')}
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-t border-black/5">
              <td className="py-2 pr-3 whitespace-nowrap">{user.phoneDisplay}</td>
              <td className="py-2 pr-3">{user.address}</td>
              <td className="py-2 pr-3">{t(`demo.channel.${user.registrationChannel}`)}</td>
              <td className="py-2 pr-3">{yesNo(user.hasMobileSession)}</td>
              <td className={`py-2 pr-3 ${user.getsSmsAlerts ? 'font-medium text-brand' : ''}`}>
                {yesNo(user.getsSmsAlerts)}
              </td>
              <td className="py-2 whitespace-nowrap">{time(user.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const PRESETS = ['plain', 'long', 'attachment', 'malicious'] as const;
type Preset = (typeof PRESETS)[number];

/** "Send an email into PhoneMail" over real SMTP, from an outside address. */
function SendEmailPanel() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const [to, setTo] = useState('9000000002');
  const [preset, setPreset] = useState<Preset>('plain');

  const send = useMutation({
    mutationFn: () =>
      api('/demo/send-email', {
        method: 'POST',
        body: { to, preset },
        schema: z.object({ ok: z.literal(true), response: z.string() }),
      }),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    send.mutate();
  }

  return (
    <section aria-labelledby="send-title" className="rounded-xl bg-surface p-4 shadow-sm">
      <h2 id="send-title" className="font-medium">
        {t('demo.sendTitle')}
      </h2>
      <p className="mt-1 mb-3 text-sm text-text-muted">{t('demo.sendHint')}</p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t('demo.sendTo')}
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-black/15 px-3 py-2 font-normal"
          />
        </label>
        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-1 text-sm font-medium">{t('demo.presetLabel')}</legend>
          {PRESETS.map((p) => (
            <label
              key={p}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${
                preset === p ? 'border-brand bg-brand/10 text-brand' : 'border-black/15'
              }`}
            >
              <input
                type="radio"
                name="preset"
                value={p}
                checked={preset === p}
                onChange={() => setPreset(p)}
                className="sr-only"
              />
              {t(`demo.preset.${p}`)}
            </label>
          ))}
        </fieldset>
        <button
          type="submit"
          disabled={send.isPending || !to.trim()}
          className="min-h-11 self-start rounded-full bg-brand px-5 font-medium text-white disabled:opacity-50"
        >
          {send.isPending ? t('demo.sending') : t('demo.sendButton')}
        </button>
        <p aria-live="polite" className="text-sm">
          {send.isSuccess && (
            <span className="text-brand">{t('demo.sent', { response: send.data.response })}</span>
          )}
          {send.isError && <span className="text-danger">{errorText(send.error)}</span>}
        </p>
      </form>
    </section>
  );
}

const fieldClass = 'rounded-lg border border-black/15 px-3 py-2 font-normal';
const buttonClass =
  'min-h-11 rounded-full bg-brand px-5 font-medium text-white disabled:opacity-50';

/**
 * The phone world without a phone: the same service code as the Twilio and
 * SMSGate webhooks, with the call's transcript shown on screen.
 */
function PhoneSimulatorPanel() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const [callPhone, setCallPhone] = useState('');
  const [digit, setDigit] = useState('1');
  const [smsPhone, setSmsPhone] = useState('');
  const [smsText, setSmsText] = useState('JOIN');
  const [via, setVia] = useState<'twilio' | 'smsgate'>('smsgate');

  const call = useMutation({
    mutationFn: () =>
      api('/demo/ivr/simulate', {
        method: 'POST',
        body: { phone: callPhone, digit },
        schema: z.object({
          transcript: z.array(z.string()),
          account: z.object({ address: z.string(), created: z.boolean() }).nullable(),
        }),
      }),
  });
  const callMe = useMutation({
    mutationFn: () =>
      api('/demo/ivr/call-me', {
        method: 'POST',
        body: { phone: callPhone },
        schema: z.object({ callSid: z.string() }),
      }),
  });
  const sms = useMutation({
    mutationFn: () =>
      api('/demo/sms/simulate', {
        method: 'POST',
        body: { phone: smsPhone, text: smsText, via },
        schema: z.object({
          outcome: z.string(),
          reason: z.string().optional(),
          address: z.string().optional(),
        }),
      }),
  });

  return (
    <section aria-labelledby="phone-title" className="rounded-xl bg-surface p-4 shadow-sm">
      <h2 id="phone-title" className="font-medium">
        {t('demo.phoneTitle')}
      </h2>
      <p className="mt-1 mb-3 text-sm text-text-muted">{t('demo.phoneHint')}</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          call.mutate();
        }}
        className="flex flex-col gap-3"
      >
        <h3 className="text-sm font-medium">{t('demo.ivrTitle')}</h3>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            {t('demo.callerNumber')}
            <input
              value={callPhone}
              onChange={(e) => setCallPhone(e.target.value)}
              placeholder="98765 43210"
              inputMode="tel"
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t('demo.keyPressed')}
            <select value={digit} onChange={(e) => setDigit(e.target.value)} className={fieldClass}>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="">{t('demo.noKey')}</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={call.isPending || !callPhone.trim()}
            className={buttonClass}
          >
            {t('demo.simulateCall')}
          </button>
          <button
            type="button"
            disabled={callMe.isPending || !callPhone.trim()}
            onClick={() => callMe.mutate()}
            className="min-h-11 rounded-full border border-brand px-4 font-medium text-brand disabled:opacity-50"
          >
            {t('demo.callMe')}
          </button>
        </div>
        {call.data && (
          <ol
            aria-label={t('demo.transcript')}
            className="flex flex-col gap-2 rounded-lg bg-app-bg p-3 text-sm"
          >
            {call.data.transcript.map((line, i) => (
              <li key={i} className={line.startsWith('(') ? 'text-text-muted italic' : ''}>
                {line}
              </li>
            ))}
          </ol>
        )}
        <p aria-live="polite" className="text-sm">
          {call.isError && <span className="text-danger">{errorText(call.error)}</span>}
          {callMe.isSuccess && <span className="text-brand">{t('demo.calling')}</span>}
          {callMe.isError && <span className="text-danger">{errorText(callMe.error)}</span>}
        </p>
      </form>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          sms.mutate();
        }}
        className="mt-4 flex flex-col gap-3 border-t border-black/5 pt-4"
      >
        <h3 className="text-sm font-medium">{t('demo.smsTitle')}</h3>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            {t('demo.senderNumber')}
            <input
              value={smsPhone}
              onChange={(e) => setSmsPhone(e.target.value)}
              placeholder="98765 43210"
              inputMode="tel"
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t('demo.smsText')}
            <input
              value={smsText}
              onChange={(e) => setSmsText(e.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t('demo.smsVia')}
            <select
              value={via}
              onChange={(e) => setVia(e.target.value as 'twilio' | 'smsgate')}
              className={fieldClass}
            >
              <option value="smsgate">{t('demo.viaSmsgate')}</option>
              <option value="twilio">{t('demo.viaTwilio')}</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={sms.isPending || !smsPhone.trim()}
            className={buttonClass}
          >
            {t('demo.simulateSms')}
          </button>
        </div>
        <p aria-live="polite" className="text-sm">
          {sms.data && (
            <span className={sms.data.outcome === 'ignored' ? 'text-text-muted' : 'text-brand'}>
              {t(`demo.smsOutcome.${sms.data.outcome}`, {
                address: sms.data.address,
                reason: sms.data.reason,
              })}
            </span>
          )}
          {sms.isError && <span className="text-danger">{errorText(sms.error)}</span>}
        </p>
      </form>
    </section>
  );
}
