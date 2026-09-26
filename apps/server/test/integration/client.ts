/**
 * A tiny browser stand-in for integration tests: keeps cookies, adds the CSRF
 * header, signs in with the demo code. Talks to the stack through nginx.
 */
// Not BASE_URL: Vitest fills process.env.BASE_URL with Vite's "/" and the tests
// would quietly skip.
export const BASE_URL = process.env.PHONEMAIL_URL ?? 'http://localhost:8080';
export const SMTP_HOST = process.env.SMTP_HOST ?? 'localhost';
export const SMTP_PORT = Number(process.env.SMTP_PORT ?? 2525);

export async function stackIsUp(): Promise<boolean> {
  let up: boolean;
  try {
    up = (await fetch(`${BASE_URL}/api/health`)).ok;
  } catch {
    up = false;
  }
  // Locally the tests skip without the stack; in CI that would hide a broken setup.
  if (!up && process.env.CI) throw new Error(`The stack is not reachable at ${BASE_URL}`);
  return up;
}

/**
 * A fresh made-up number in the demo block (9000 1xxxxx to 9000 9xxxxx, clear
 * of the seed users), so every run gets new accounts and no real phone is
 * ever texted (the server keeps these in the demo console).
 */
export function randomPhone(): string {
  return `9000${100000 + Math.floor(Math.random() * 900000)}`;
}

export class TestClient {
  private cookies = new Map<string, string>();
  address = '';
  userId = '';
  phoneE164 = '';

  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; data: T }> {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'x-requested-with': 'phonemail',
        cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(';');
      const [name, value] = pair.split('=');
      this.cookies.set(name.trim(), value);
    }
    const text = await response.text();
    return { status: response.status, data: (text ? JSON.parse(text) : undefined) as T };
  }

  /** Signs up/in with a fresh number and the demo code (needs DEMO_MODE=true). */
  static async signIn(client: 'web' | 'mobile' = 'web'): Promise<TestClient> {
    const c = new TestClient();
    const phone = randomPhone();
    const sent = await c.request<{ demoCode?: string }>('POST', '/api/auth/otp/request', { phone });
    if (!sent.data?.demoCode) throw new Error(`no demo code: ${JSON.stringify(sent)}`);
    const verified = await c.request<{ user: { id: string; address: string; phoneE164: string } }>(
      'POST',
      '/api/auth/otp/verify',
      { phone, code: sent.data.demoCode, client },
    );
    if (verified.status !== 200) throw new Error(`sign-in failed: ${JSON.stringify(verified)}`);
    c.address = verified.data.user.address;
    c.userId = verified.data.user.id;
    c.phoneE164 = verified.data.user.phoneE164;
    return c;
  }
}

/** Retries until the check passes (mail arrives asynchronously). */
export async function eventually<T>(check: () => Promise<T | undefined>, tries = 20): Promise<T> {
  for (let i = 0; i < tries; i++) {
    const result = await check();
    if (result !== undefined) return result;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('condition not met in time');
}
