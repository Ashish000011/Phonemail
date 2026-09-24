import { afterEach, describe, expect, it } from 'vitest';
import { pino } from 'pino';
import type { FastifyInstance } from 'fastify';
import { publicConfigSchema } from '@phonemail/shared';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import type { HealthChecks } from '../src/modules/system/routes.js';

const up = async () => true;
const down = async () => false;

let app: FastifyInstance | undefined;

async function makeApp(checks: Partial<HealthChecks> = {}) {
  app = await buildApp({
    env: loadEnv({}),
    logger: pino({ level: 'silent' }),
    checks: { postgres: up, redis: up, migrations: up, ...checks },
  });
  return app;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('GET /api/health', () => {
  it('is 200 when Postgres and Redis answer', async () => {
    const res = await (await makeApp()).inject({ url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', checks: { postgres: true, redis: true } });
  });

  it('is 503 when a dependency is down', async () => {
    const res = await (await makeApp({ redis: down })).inject({ url: '/api/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ status: 'degraded', checks: { redis: false } });
  });
});

describe('GET /api/ready', () => {
  it('is 503 until migrations have run', async () => {
    const res = await (await makeApp({ migrations: down })).inject({ url: '/api/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ ready: false });
  });
});

describe('GET /api/config', () => {
  it('matches the shared schema and holds no secrets', async () => {
    const res = await (await makeApp()).inject({ url: '/api/config' });
    expect(res.statusCode).toBe(200);
    const config = publicConfigSchema.parse(res.json());
    expect(config).toMatchObject({ authMode: 'otp', demoMode: true, otpPath: 'console' });
    expect(res.body).not.toMatch(/secret|pepper|token/i);
  });
});

describe('errors and CSRF', () => {
  it('unknown routes answer with the standard error shape', async () => {
    const res = await (await makeApp()).inject({ url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found.' } });
  });

  it('rejects state-changing API calls without the CSRF header', async () => {
    const res = await (await makeApp()).inject({ method: 'POST', url: '/api/anything' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CSRF_HEADER_MISSING');
  });

  it('lets them through with the header (404 here, since the route does not exist)', async () => {
    const res = await (
      await makeApp()
    ).inject({
      method: 'POST',
      url: '/api/anything',
      headers: { 'x-requested-with': 'phonemail' },
    });
    expect(res.statusCode).toBe(404);
  });
});
