import type { Env } from '../../config/env.js';
import type { FetchFn, SmsProvider } from './types.js';

/**
 * SMSGate turns an Android phone into an SMS gateway; the SMS leaves from the
 * phone's own SIM, so it can carry any text (our OTP codes, the task's exact
 * alert wording). Cloud mode API, checked against docs.sms-gate.app:
 *   POST {SMSGATE_API_URL}/messages   basic auth
 *   { "textMessage": { "text": "…" }, "phoneNumbers": ["+91…"] }
 */
export function createSmsGateProvider(env: Env, fetchImpl: FetchFn = fetch): SmsProvider {
  return {
    name: 'smsgate',
    isConfigured: () => Boolean(env.SMSGATE_USERNAME && env.SMSGATE_PASSWORD),
    supportsCustomText: () => true,
    async send(toE164, body) {
      const auth = Buffer.from(`${env.SMSGATE_USERNAME}:${env.SMSGATE_PASSWORD}`).toString(
        'base64',
      );
      const response = await fetchImpl(`${env.SMSGATE_API_URL}/messages`, {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ textMessage: { text: body }, phoneNumbers: [toE164] }),
        signal: AbortSignal.timeout(10_000),
      });
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        throw new Error(`SMSGate ${response.status}: ${String(data.message ?? 'request failed')}`);
      }
      return { status: 'sent', providerMessageId: String(data.id ?? ''), sentBody: body };
    },
  };
}
