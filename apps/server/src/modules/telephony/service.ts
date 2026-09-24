import { randomInt } from 'node:crypto';
import { env } from '../../config/env.js';
import { getQueue, QUEUES } from '../../lib/queue.js';
import type { RequestMeta } from '../../lib/request-meta.js';
import { authMode, smsSender } from '../../services.js';
import type { SmsPurpose } from '../../providers/sms/index.js';
import { formatAddress, tryNormalizePhone } from '../addressing/index.js';
import { createAccount } from '../accounts/service.js';
import { hashTemporaryPin } from '../auth/passwords.js';
import { classifyInboundSms, type SmsSource } from './inbound-sms.js';
import {
  gather,
  hangup,
  redirect,
  response,
  say,
  spokenDigits,
  spokenDomain,
  type Voice,
} from './twiml.js';

/**
 * Account creation by phone call (IVR) and by SMS (docs/spec/06). The Twilio
 * webhooks and the demo console's simulators call exactly these functions,
 * so the simulator shows precisely what a real caller hears.
 */

export const IVR_TEXT = {
  welcome:
    'Welcome to PhoneMail, where your phone number is your email address. To create your free PhoneMail account, press 1.',
  notAnOption: "Sorry, that's not an option.",
  goodbye: "Sorry, we didn't get a choice. Goodbye!",
  noNumber: "Sorry, we couldn't read your phone number. Please call from a mobile phone. Goodbye!",
};

const voice = (): Voice => ({ voice: env.TWILIO_VOICE, language: 'en-IN' });

export interface IvrStep {
  twiml: string;
  /** What the caller hears, line by line (for the demo console). */
  transcript: string[];
  account?: { address: string; created: boolean };
}

/** First TwiML of a call: the menu. If nothing is pressed, one retry, then goodbye. */
export function ivrWelcome(retry: boolean): IvrStep {
  const menu = gather(
    `/webhooks/twilio/voice/menu${retry ? '?retry=1' : ''}`,
    say(IVR_TEXT.welcome, voice()),
  );
  const next = retry
    ? say(IVR_TEXT.goodbye, voice()) + hangup()
    : redirect('/webhooks/twilio/voice?retry=1');
  return { twiml: response(menu, next), transcript: [IVR_TEXT.welcome] };
}

export interface SignupSmsJob {
  toE164: string;
  body: string;
  purpose: Extract<SmsPurpose, 'ivr_confirmation' | 'signup_reply'>;
  userId?: string;
}

/** SMS replies go through the worker, so webhooks answer within Twilio's 5-second budget. */
export async function queueSignupSms(job: SignupSmsJob): Promise<void> {
  await getQueue(QUEUES.signup).add(job.purpose, job);
}

export async function sendSignupSms(job: SignupSmsJob): Promise<void> {
  await smsSender.send({
    to: job.toE164,
    body: job.body,
    purpose: job.purpose,
    userId: job.userId,
  });
}

function welcomeSms(localPart: string, pin?: string): string {
  const address = formatAddress(localPart, env.MAIL_DOMAIN);
  const link = `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/m?phone=${localPart}`;
  const pinPart = pin ? ` Your temporary PIN is ${pin}.` : '';
  return `Welcome to PhoneMail! Your email address is ${address}.${pinPart} Sign in at ${link}`;
}

/** After the caller pressed a key. Digit 1 creates the account (or finds it). */
export async function ivrMenu(input: {
  callerPhone: string;
  digits: string;
  retry: boolean;
  meta?: Partial<RequestMeta>;
}): Promise<IvrStep> {
  const v = voice();
  if (input.digits !== '1') {
    const next = input.retry
      ? say(IVR_TEXT.goodbye, v) + hangup()
      : redirect('/webhooks/twilio/voice?retry=1');
    return {
      twiml: response(say(IVR_TEXT.notAnOption, v), next),
      transcript: input.retry ? [IVR_TEXT.notAnOption, IVR_TEXT.goodbye] : [IVR_TEXT.notAnOption],
    };
  }

  const phone = tryNormalizePhone(input.callerPhone, env.DEFAULT_COUNTRY);
  if (!phone) {
    return {
      twiml: response(say(IVR_TEXT.noNumber, v), hangup()),
      transcript: [IVR_TEXT.noNumber],
    };
  }

  // Password mode: the call reads out a temporary PIN; the first sign-in asks for a new password.
  const pin =
    authMode === 'password' ? String(randomInt(0, 1_000_000)).padStart(6, '0') : undefined;
  const { user, created } = await createAccount({
    phone: phone.e164,
    channel: 'ivr',
    passwordHash: pin ? await hashTemporaryPin(pin) : undefined,
    mustChangePassword: Boolean(pin),
    meta: input.meta,
  });
  const spoken = `${spokenDigits(user.localPart)}, at ${spokenDomain(env.MAIL_DOMAIN)}`;
  const address = formatAddress(user.localPart, env.MAIL_DOMAIN);

  let lines: string[];
  if (created) {
    lines = [`Your PhoneMail account is ready. Your email address is ${spoken}.`];
    if (pin) {
      lines.push(
        `Your temporary PIN is ${spokenDigits(pin)}. Again, your PIN is ${spokenDigits(pin)}.`,
      );
    }
    lines.push("We've sent you an SMS with the details. Thank you for calling.");
    // The PIN goes by SMS only through a provider that sends our own text (not a Twilio template).
    const smsPin = pin && smsSender.canSend('otp') ? pin : undefined;
    await queueSignupSms({
      toE164: user.phoneE164,
      body: welcomeSms(user.localPart, smsPin),
      purpose: 'ivr_confirmation',
      userId: user.id,
    });
  } else {
    lines = [
      `You already have a PhoneMail account. Your email address is ${spoken}. Thank you for calling.`,
    ];
  }
  return {
    twiml: response(...lines.map((line) => say(line, v)), hangup()),
    transcript: lines,
    account: { address, created },
  };
}

export type InboundSmsOutcome =
  | { outcome: 'ignored'; reason: string }
  | { outcome: 'help' }
  | { outcome: 'created' | 'existing'; address: string };

function helpSms(source: SmsSource): string {
  const how =
    source === 'smsgate'
      ? `Reply ${env.SMSGATE_SIGNUP_KEYWORD.toUpperCase()} to get yours`
      : 'Text anything to this number to get yours';
  return `PhoneMail gives you an email address that is your phone number. ${how}, or sign up at ${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/m`;
}

/** A text arrived at our Twilio number or the SMSGate phone. Ignored texts are never stored. */
export async function handleInboundSms(
  source: SmsSource,
  sender: string,
  body: string,
  meta?: Partial<RequestMeta>,
): Promise<InboundSmsOutcome> {
  const action = classifyInboundSms(source, sender, body, {
    keyword: env.SMSGATE_SIGNUP_KEYWORD,
    defaultCountry: env.DEFAULT_COUNTRY,
  });
  if (action.kind === 'ignore') return { outcome: 'ignored', reason: action.reason };

  if (action.kind === 'help') {
    await queueSignupSms({
      toE164: action.phoneE164,
      body: helpSms(source),
      purpose: 'signup_reply',
    });
    return { outcome: 'help' };
  }

  const { user, created } = await createAccount({ phone: action.phoneE164, channel: 'sms', meta });
  const address = formatAddress(user.localPart, env.MAIL_DOMAIN);
  await queueSignupSms({
    toE164: user.phoneE164,
    body: created
      ? welcomeSms(user.localPart)
      : `You already have a PhoneMail address: ${address}. Sign in at ${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/m?phone=${user.localPart}`,
    purpose: 'signup_reply',
    userId: user.id,
  });
  return { outcome: created ? 'created' : 'existing', address };
}
