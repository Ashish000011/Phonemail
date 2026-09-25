import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  gather,
  hangup,
  redirect,
  response,
  say,
  spokenDigits,
  spokenDomain,
  twilioRecordMatches,
  twilioRecordToConfirm,
  twilioSignature,
  validTwilioSignature,
} from '../src/modules/telephony/twiml.js';
import { classifyInboundSms } from '../src/modules/telephony/inbound-sms.js';
import { ivrWelcome, IVR_TEXT } from '../src/modules/telephony/service.js';

const voice = { voice: 'Polly.Aditi', language: 'en-IN' };

describe('TwiML builders', () => {
  it('wraps verbs in a Response', () => {
    expect(response(hangup())).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>',
    );
  });

  it('escapes text so callers hear it, not XML', () => {
    expect(say('Tom & "Jerry" <3', voice)).toBe(
      '<Say voice="Polly.Aditi" language="en-IN">Tom &amp; &quot;Jerry&quot; &lt;3</Say>',
    );
  });

  it('gathers one digit and posts it to the action URL', () => {
    expect(gather('/webhooks/twilio/voice/menu', say('Press 1', voice))).toBe(
      '<Gather input="dtmf" numDigits="1" timeout="7" action="/webhooks/twilio/voice/menu" method="POST">' +
        '<Say voice="Polly.Aditi" language="en-IN">Press 1</Say></Gather>',
    );
    expect(redirect('/x?retry=1')).toBe('<Redirect method="POST">/x?retry=1</Redirect>');
  });

  it('reads addresses digit by digit in groups of five', () => {
    expect(spokenDigits('9876543210')).toBe('9 8 7 6 5, 4 3 2 1 0');
    expect(spokenDigits('0014155550123')).toBe('0 0 1 4 1, 5 5 5 5 0, 1 2 3');
    expect(spokenDomain('phonemail.com')).toBe('phonemail dot com');
  });
});

describe('IVR scripts', () => {
  it('first try: menu, then one retry if nothing is pressed', () => {
    const step = ivrWelcome(false);
    expect(step.transcript).toEqual([IVR_TEXT.welcome]);
    expect(step.twiml).toContain('action="http://localhost:8080/webhooks/twilio/voice/menu"');
    expect(step.twiml).toContain(
      '<Redirect method="POST">http://localhost:8080/webhooks/twilio/voice?retry=1</Redirect>',
    );
  });

  it('retry: menu again, then goodbye and hang up', () => {
    const step = ivrWelcome(true);
    expect(step.twiml).toContain(
      'action="http://localhost:8080/webhooks/twilio/voice/menu?retry=1"',
    );
    expect(step.twiml).toContain('Goodbye');
    expect(step.twiml).toContain('<Hangup/>');
    expect(step.twiml).not.toContain('<Redirect');
  });
});

describe('Twilio signature check', () => {
  const token = 'test-auth-token';
  const url = 'https://abc.trycloudflare.com/webhooks/twilio/voice/menu?retry=1';
  const params = { From: '+919876543210', Digits: '1', CallSid: 'CA123' };

  // Written out independently of the code under test, from Twilio's docs:
  // HMAC-SHA1 over the URL followed by each parameter name+value, sorted by name.
  const expected = createHmac('sha1', token)
    .update(`${url}CallSidCA123Digits1From+919876543210`)
    .digest('base64');

  it('matches the documented algorithm', () => {
    expect(twilioSignature(token, url, params)).toBe(expected);
  });

  it('accepts the genuine signature', () => {
    expect(validTwilioSignature(token, url, params, expected)).toBe(true);
  });

  it('rejects tampered parameters, another URL, a wrong token or no signature', () => {
    expect(validTwilioSignature(token, url, { ...params, From: '+911111111111' }, expected)).toBe(
      false,
    );
    expect(validTwilioSignature(token, url.replace('abc', 'evil'), params, expected)).toBe(false);
    expect(validTwilioSignature('other-token', url, params, expected)).toBe(false);
    expect(validTwilioSignature(token, url, params, undefined)).toBe(false);
  });
});

describe('inbound SMS rules', () => {
  const options = { keyword: 'JOIN', defaultCountry: 'IN' };

  it('the Twilio number signs up on any text', () => {
    expect(classifyInboundSms('twilio', '+919876543210', 'hello!', options)).toEqual({
      kind: 'join',
      phoneE164: '+919876543210',
    });
  });

  it('SMSGate (a personal phone) needs the keyword, in any case', () => {
    expect(classifyInboundSms('smsgate', '9876543210', 'join please', options).kind).toBe('join');
    expect(classifyInboundSms('smsgate', '9876543210', 'hey, dinner at 8?', options)).toEqual({
      kind: 'ignore',
      reason: 'no-keyword',
    });
  });

  it('"*" as the keyword accepts any text (a phone used only for PhoneMail)', () => {
    expect(
      classifyInboundSms('smsgate', '9876543210', 'hi', { ...options, keyword: '*' }).kind,
    ).toBe('join');
  });

  it('HELP and INFO get the explanation on both channels', () => {
    expect(classifyInboundSms('smsgate', '9876543210', 'help', options).kind).toBe('help');
    expect(classifyInboundSms('twilio', '+919876543210', 'INFO', options).kind).toBe('help');
  });

  it.each(['VM-HDFCBK', 'AX-AMAZON', 'Google', '12345'])(
    'ignores senders that are not phone numbers (%s)',
    (sender) => {
      expect(classifyInboundSms('smsgate', sender, 'JOIN', options)).toEqual({
        kind: 'ignore',
        reason: 'not-a-phone-number',
      });
    },
  );
});

describe('unsigned webhooks on trial accounts are confirmed with Twilio', () => {
  const account = 'AC' + 'a'.repeat(32);
  const callSid = 'CA' + 'b'.repeat(32);
  const params = {
    AccountSid: account,
    CallSid: callSid,
    From: '+17372508034',
    To: '+919876543210',
  };
  const live = {
    account_sid: account,
    status: 'in-progress',
    from: '+17372508034',
    to: '+919876543210',
  };

  it('asks Twilio for the call named in the webhook', () => {
    expect(twilioRecordToConfirm(params, account)).toEqual({ kind: 'Calls', sid: callSid });
  });

  it('asks nothing for another account, a malformed id or no id', () => {
    expect(
      twilioRecordToConfirm({ ...params, AccountSid: 'AC' + 'c'.repeat(32) }, account),
    ).toBeNull();
    expect(twilioRecordToConfirm({ ...params, CallSid: '../Messages' }, account)).toBeNull();
    expect(twilioRecordToConfirm({ AccountSid: account }, account)).toBeNull();
    expect(twilioRecordToConfirm(params, '')).toBeNull();
  });

  it('accepts a live call on our account with the same numbers', () => {
    expect(twilioRecordMatches(params, live, account)).toBe(true);
  });

  it('refuses a finished call (a replayed request), another account or other numbers', () => {
    expect(twilioRecordMatches(params, { ...live, status: 'completed' }, account)).toBe(false);
    expect(
      twilioRecordMatches(params, { ...live, account_sid: 'AC' + 'c'.repeat(32) }, account),
    ).toBe(false);
    expect(twilioRecordMatches(params, { ...live, to: '+911111111111' }, account)).toBe(false);
  });
});
