import { env } from '../config/env.js';

/**
 * Points the Twilio number's "A call comes in" and "A message comes in"
 * webhooks at PUBLIC_BASE_URL, so nobody has to paste URLs into the Twilio
 * console after every tunnel restart. Runs inside the stack:
 *
 *   docker compose exec api node dist/scripts/twilio-webhooks.js
 */
const sid = env.TWILIO_ACCOUNT_SID;
const number = env.TWILIO_PHONE_NUMBER;
if (!sid || !env.TWILIO_AUTH_TOKEN || !number) {
  console.error('Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER in .env first.');
  process.exit(2);
}
const base = env.PUBLIC_BASE_URL.replace(/\/$/, '');
if (!base.startsWith('https://')) {
  console.error('PUBLIC_BASE_URL must be the public https:// tunnel URL.');
  process.exit(2);
}

const auth = `Basic ${Buffer.from(`${sid}:${env.TWILIO_AUTH_TOKEN}`).toString('base64')}`;
const api = `https://api.twilio.com/2010-04-01/Accounts/${sid}`;

async function twilio(method: string, url: string, form?: Record<string, string>) {
  const response = await fetch(url, {
    method,
    headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form ? new URLSearchParams(form) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error(`Twilio ${response.status}: ${String(data.message)}`);
  return data;
}

try {
  const found = await twilio(
    'GET',
    `${api}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(number)}`,
  );
  const numbers = (found.incoming_phone_numbers ?? []) as { sid: string }[];
  if (!numbers[0]) {
    // Twilio's free trial lends a shared number that can't be configured (DECISIONS 77).
    console.log(
      `Twilio ${number} is a shared trial number, so incoming calls and texts can't be set up. "Call me" in the demo console still works.`,
    );
    process.exit(0);
  }
  await twilio('POST', `${api}/IncomingPhoneNumbers/${numbers[0].sid}.json`, {
    VoiceUrl: `${base}/webhooks/twilio/voice`,
    VoiceMethod: 'POST',
    SmsUrl: `${base}/webhooks/twilio/sms`,
    SmsMethod: 'POST',
  });
  console.log(`Twilio ${number}: calls → ${base}/webhooks/twilio/voice`);
  console.log(`Twilio ${number}: texts → ${base}/webhooks/twilio/sms`);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
