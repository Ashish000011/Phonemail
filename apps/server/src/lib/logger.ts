import { pino, type Logger } from 'pino';
import { env } from '../config/env.js';

export type { Logger };

/**
 * JSON logs in production (one line per event, easy to search), pretty logs
 * in local development. `service` tells api, smtp and worker lines apart.
 */
export function createLogger(service: string): Logger {
  return pino({
    level: env.LOG_LEVEL,
    base: { service },
    // Never write secrets or codes into logs.
    redact: {
      paths: ['req.headers.cookie', 'req.headers.authorization', '*.password', '*.code', '*.token'],
      censor: '[redacted]',
    },
    transport:
      env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
        : undefined,
  });
}
