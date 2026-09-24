import type { FastifyInstance } from 'fastify';
import { LANGUAGES, type PublicConfig } from '@phonemail/shared';
import type { Env } from '../../config/env.js';
import { APP_VERSION, TOS_VERSION } from '../../config/constants.js';
import { buildProviderSummary } from '../../config/providers.js';

/** Dependency checks, injected so tests can run without Postgres or Redis. */
export interface HealthChecks {
  postgres: () => Promise<boolean>;
  redis: () => Promise<boolean>;
  migrations: () => Promise<boolean>;
}

export function buildPublicConfig(env: Env): PublicConfig {
  const summary = buildProviderSummary(env);
  return {
    authMode: summary.authMode,
    demoMode: env.DEMO_MODE,
    mailDomain: env.MAIL_DOMAIN,
    languages: [...LANGUAGES],
    tosVersion: TOS_VERSION,
    otpPath: summary.otpPath,
  };
}

export function registerSystemRoutes(app: FastifyInstance, env: Env, checks: HealthChecks) {
  const startedAt = Date.now();

  // Liveness plus dependency status, for Docker and for humans.
  app.get('/api/health', async (_request, reply) => {
    const [postgres, redis] = await Promise.all([checks.postgres(), checks.redis()]);
    const ok = postgres && redis;
    return reply.status(ok ? 200 : 503).send({
      status: ok ? 'ok' : 'degraded',
      checks: { postgres, redis },
      version: APP_VERSION,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    });
  });

  // Ready to serve real traffic: dependencies up and the schema migrated.
  app.get('/api/ready', async (_request, reply) => {
    const [postgres, redis, migrations] = await Promise.all([
      checks.postgres(),
      checks.redis(),
      checks.migrations(),
    ]);
    const ready = postgres && redis && migrations;
    return reply.status(ready ? 200 : 503).send({ ready, checks: { postgres, redis, migrations } });
  });

  // The non-secret settings every UI needs to render the right sign-in fields.
  const publicConfig = buildPublicConfig(env);
  app.get('/api/config', async () => publicConfig);
}
