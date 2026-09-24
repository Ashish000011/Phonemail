import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from '@phonemail/shared';
import type { Env } from './config/env.js';
import { AppError, errorBody, errorHandler } from './lib/errors.js';
import { registerSystemRoutes, type HealthChecks } from './modules/system/routes.js';

export interface AppDeps {
  env: Env;
  /** A pino logger (see lib/logger.ts); Fastify adds a request id to each line. */
  logger: FastifyBaseLogger;
  checks: HealthChecks;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Builds the HTTP API without starting it, so tests can call routes with
 * `app.inject()` and the api entrypoint can `listen()`.
 */
export async function buildApp({ env, logger, checks }: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: logger,
    // Reuse the id nginx or the client sent, so one request can be traced across logs.
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
    // nginx (and cloudflared) sit in front; trust them for the client IP.
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  });

  // Security headers on API responses. nginx adds the page headers (CSP etc.) for the SPA.
  await app.register(helmet, { contentSecurityPolicy: false });

  // CSRF defence: browsers can't add a custom header on a cross-site form post,
  // so every state-changing API call must carry it. Webhooks live under /webhooks.
  app.addHook('onRequest', async (request) => {
    if (SAFE_METHODS.has(request.method) || !request.url.startsWith('/api/')) return;
    if (request.headers[CSRF_HEADER] !== CSRF_HEADER_VALUE) {
      throw new AppError(403, 'CSRF_HEADER_MISSING', 'Missing X-Requested-With header.');
    }
  });

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send(errorBody('NOT_FOUND', 'Not found.')),
  );

  registerSystemRoutes(app, env, checks);

  return app;
}
