import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.js';
import { SmsSender, type SmsLogEntry } from '../src/providers/sms/index.js';
import { createTwilioSmsProvider } from '../src/providers/sms/twilio.js';
import { createSmsGateProvider } from '../src/providers/sms/smsgate.js';
import type { SmsProvider } from '../src/providers/sms/types.js';
import { buildOtpSms } from '../src/providers/otp/text.js';

function fakeProvider(
  name: SmsProvider['name'],
  opts: { customText?: boolean; fails?: boolean; configured?: boolean } = {},
): SmsProvider & { sent: string[] } {
  const sent: string[] = [];
  return {
    name,
    sent,
    isConfigured: () => opts.configured ?? true,
    supportsCustomText: () => opts.customText ?? true,
    async send(to, body) {
      if (opts.fails) throw new Error(`${name} is down`);
      sent.push(`${to}: ${body}`);
      return { status: name === 'console' ? 'simulated' : 'sent', sentBody: body };
    },
  };
}

function makeSender(providers: SmsProvider[], demoMode = true) {
  const logs: SmsLogEntry[] = [];
  const sender = new SmsSender(providers, async (e) => void logs.push(e), demoMode);
  return { sender, logs };
}

const input = { to: '+919876543210', body: 'hello', purpose: 'notification' as const };

describe('SmsSender', () => {
  it('uses the first configured provider', async () => {
    const smsgate = fakeProvider('smsgate', { configured: false });
    const twilio = fakeProvider('twilio');
    const { sender, logs } = makeSender([smsgate, twilio, fakeProvider('console')]);
    expect(await sender.send(input)).toEqual({ provider: 'twilio', status: 'sent' });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ provider: 'twilio', status: 'sent', body: 'hello' });
  });

  it('falls through to the next provider on failure and logs both attempts', async () => {
    const { sender, logs } = makeSender([
      fakeProvider('smsgate', { fails: true }),
      fakeProvider('console'),
    ]);
    expect(await sender.send(input)).toEqual({ provider: 'console', status: 'simulated' });
    expect(logs.map((l) => [l.provider, l.status])).toEqual([
      ['smsgate', 'failed'],
      ['console', 'simulated'],
    ]);
    expect(logs[0].error).toMatch(/down/);
  });

  it('never sends codes through a template-only provider', async () => {
    const twilioTrial = fakeProvider('twilio', { customText: false });
    const consoleProvider = fakeProvider('console');
    const { sender } = makeSender([twilioTrial, consoleProvider]);
    await sender.send({ ...input, purpose: 'otp', body: '123456 is your code' });
    expect(twilioTrial.sent).toHaveLength(0);
    expect(consoleProvider.sent).toHaveLength(1);
  });

  it('template-only providers still send notifications', async () => {
    const { sender } = makeSender([fakeProvider('twilio', { customText: false })]);
    expect((await sender.send(input)).provider).toBe('twilio');
  });

  it('fails with SMS_UNAVAILABLE when nothing can send', async () => {
    const { sender } = makeSender([fakeProvider('smsgate', { fails: true })]);
    await expect(sender.send(input)).rejects.toMatchObject({ code: 'SMS_UNAVAILABLE' });
  });

  it('masks codes in the log outside demo mode', async () => {
    const { sender, logs } = makeSender([fakeProvider('smsgate')], false);
    await sender.send({ ...input, purpose: 'otp', body: '123456 is your PhoneMail code' });
    expect(logs[0].body).toBe('•••••• is your PhoneMail code');
  });
});

describe('provider adapters', () => {
  function fakeFetch(response: object, status = 200) {
    const calls: { url: string; init: RequestInit }[] = [];
    const fn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(response), { status });
    }) as unknown as typeof fetch;
    return { fn, calls };
  }

  const twilioEnv = {
    TWILIO_ACCOUNT_SID: 'AC1',
    TWILIO_AUTH_TOKEN: 'secret',
    TWILIO_PHONE_NUMBER: '+15550001111',
  };

  it('Twilio on trial sends the template instead of our text', async () => {
    const { fn, calls } = fakeFetch({ sid: 'SM1' });
    const provider = createTwilioSmsProvider(loadEnv(twilioEnv), fn);
    const result = await provider.send('+919876543210', 'You have received an email', 'other');
    expect(result).toEqual({
      status: 'sent',
      providerMessageId: 'SM1',
      sentBody: 'sms_account_alerts',
    });
    const body = new URLSearchParams(String(calls[0].init.body));
    expect(body.get('Body')).toBe('sms_account_alerts');
    expect(body.get('To')).toBe('+919876543210');
    expect(calls[0].url).toContain('/Accounts/AC1/Messages.json');
  });

  it('Twilio on a paid account sends our text', async () => {
    const { fn, calls } = fakeFetch({ sid: 'SM2' });
    const provider = createTwilioSmsProvider(loadEnv({ ...twilioEnv, TWILIO_TRIAL: 'false' }), fn);
    await provider.send('+919876543210', 'real text', 'other');
    expect(new URLSearchParams(String(calls[0].init.body)).get('Body')).toBe('real text');
  });

  it('Twilio errors become exceptions (so the chain moves on)', async () => {
    const { fn } = fakeFetch({ message: 'unverified number' }, 400);
    const provider = createTwilioSmsProvider(loadEnv(twilioEnv), fn);
    await expect(provider.send('+919876543210', 'x', 'other')).rejects.toThrow(/unverified/);
  });

  it('SMSGate posts the documented JSON shape', async () => {
    const { fn, calls } = fakeFetch({ id: 'msg-1' });
    const provider = createSmsGateProvider(
      loadEnv({ SMSGATE_USERNAME: 'u', SMSGATE_PASSWORD: 'p' }),
      fn,
    );
    await provider.send('+919876543210', 'hello', 'other');
    expect(calls[0].url).toBe('https://api.sms-gate.app/3rdparty/v1/messages');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      textMessage: { text: 'hello' },
      phoneNumbers: ['+919876543210'],
    });
  });
});

describe('OTP SMS text', () => {
  it('ends with the WebOTP line for the public host', () => {
    const text = buildOtpSms('482913', 'https://abc.trycloudflare.com');
    expect(text.startsWith('482913 is your PhoneMail code.')).toBe(true);
    expect(text.split('\n').at(-1)).toBe('@abc.trycloudflare.com #482913');
  });
});
