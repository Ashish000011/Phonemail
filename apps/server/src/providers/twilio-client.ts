import type { Env } from '../config/env.js';
import type { FetchFn } from './sms/types.js';

/**
 * Twilio's REST API is plain HTTPS with form bodies and basic auth, so we call
 * it with fetch instead of pulling in the large Twilio SDK.
 */
export async function twilioPost(
  env: Env,
  url: string,
  form: Record<string, string>,
  fetchImpl: FetchFn = fetch,
): Promise<Record<string, unknown>> {
  const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(form),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const error = new Error(
      `Twilio ${response.status}: ${String(data.message ?? 'request failed')}`,
    );
    Object.assign(error, { status: response.status, twilioCode: data.code });
    throw error;
  }
  return data;
}

export function twilioConfigured(env: Env): boolean {
  return Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_PHONE_NUMBER);
}
