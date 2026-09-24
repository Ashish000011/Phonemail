import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from '@phonemail/shared';
import type { Env } from './config/env.js';
import { APP_VERSION } from './config/constants.js';
import { AppError, errorBody, errorHandler } from './lib/errors.js';
import { registerSystemRoutes, type HealthChecks } from './modules/system/routes.js';
import { authRoutes } from './modules/auth/routes.js';
import { userRoutes } from './modules/users/routes.js';
import { aliasRoutes } from './modules/aliases/routes.js';
import { portalRoutes } from './modules/portal/routes.js';
import { demoRoutes } from './modules/demo/routes.js';
import { mailRoutes } from './modules/mail/routes.js';
import { mailboxRoutes } from './modules/mailbox/routes.js';
import { conversationRoutes } from './modules/conversations/routes.js';

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

  // Every route validates its input with the zod schema it declares, and the
  // same schemas generate the OpenAPI docs at /api/docs.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Security headers on API responses. nginx adds the page headers (CSP etc.) for the SPA.
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 10 } });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'PhoneMail API',
        description:
          'Email where your phone number is your address. State-changing calls need the header X-Requested-With: phonemail.',
        version: APP_VERSION,
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/api/docs' });

  // CSRF defence: browsers can't add a custom header on a cross-site form post,
  // so every state-changing API call must carry it. Webhooks live under /webhooks.
  app.addHook('onRequest', async (request) => {
    if (SAFE_METHODS.has(request.method) || !request.url.startsWith('/api/')) return;
    if (request.headers[CSRF_HEADER] !== CSRF_HEADER_VALUE) {
      throw new AppError(403, 'CSRF_HEADER_MISSING', 'Missing X-Requested-With header.');
    }
  });

  app.decorateRequest('auth', null);
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send(errorBody('NOT_FOUND', 'Not found.')),
  );

  registerSystemRoutes(app, env, checks);
  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(aliasRoutes);
  await app.register(portalRoutes);
  await app.register(mailRoutes);
  await app.register(mailboxRoutes);
  await app.register(conversationRoutes);
  if (env.DEMO_MODE) await app.register(demoRoutes);

  return app;
}
