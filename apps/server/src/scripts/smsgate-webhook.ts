import { env } from '../config/env.js';

/**
 * Registers (or removes) our inbound-SMS webhook with SMSGate cloud, so texts
 * to the gateway phone reach /webhooks/smsgate/<secret>. Runs inside the stack:
 *
 *   docker compose exec api node dist/scripts/smsgate-webhook.js register
 *   docker compose exec api node dist/scripts/smsgate-webhook.js unregister
 *   docker compose exec api node dist/scripts/smsgate-webhook.js list
 *
 * Unregister after the demo: while registered, the phone forwards every SMS
 * it receives (PhoneMail ignores and never stores the unrelated ones).
 */
const command = process.argv[2] ?? 'list';
const base = env.SMSGATE_API_URL.replace(/\/$/, '');
const auth = `Basic ${Buffer.from(`${env.SMSGATE_USERNAME}:${env.SMSGATE_PASSWORD}`).toString('base64')}`;
const ourPath = '/webhooks/smsgate/';

interface Webhook {
  id: string;
  url: string;
  event: string;
}

async function call(method: string, path: string, body?: unknown) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(`SMSGate ${method} ${path}: ${response.status} ${await response.text()}`);
  const text = await response.text();
  return text ? JSON.parse(text) : undefined;
}

async function ours(): Promise<Webhook[]> {
  const hooks = ((await call('GET', '/webhooks')) ?? []) as Webhook[];
  return hooks.filter((h) => h.url.includes(ourPath));
}

if (!env.SMSGATE_USERNAME || !env.SMSGATE_PASSWORD) {
  console.error('Set SMSGATE_USERNAME and SMSGATE_PASSWORD in .env first.');
  process.exit(2);
}

try {
  if (command === 'list') {
    console.log(JSON.stringify(await ours(), null, 2));
  } else if (command === 'unregister' || command === 'register') {
    for (const hook of await ours()) {
      await call('DELETE', `/webhooks/${hook.id}`);
      console.log(`Removed ${hook.url}`);
    }
    if (command === 'register') {
      if (!env.PUBLIC_BASE_URL.startsWith('https://')) {
        throw new Error('PUBLIC_BASE_URL must be the public https:// tunnel URL.');
      }
      const url = `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}${ourPath}${env.SMSGATE_WEBHOOK_SECRET}`;
      await call('POST', '/webhooks', { url, event: 'sms:received' });
      console.log(
        `Registered sms:received → ${env.PUBLIC_BASE_URL.replace(/\/$/, '')}${ourPath}<secret>`,
      );
    }
  } else {
    console.error('Usage: smsgate-webhook register | unregister | list');
    process.exit(2);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
