import { env } from '../config/env.js';
import { logProviderSummary } from '../config/providers.js';
import { createLogger } from '../lib/logger.js';
import { db } from '../lib/db.js';
import { redis } from '../lib/redis.js';
import { closeQueues } from '../lib/queue.js';
import { createSmtpServer } from '../modules/smtp/server.js';
import { onShutdown } from './shutdown.js';

// The SMTP server for @MAIL_DOMAIN: other mail servers deliver here, and the
// api submits every email its users send.
const logger = createLogger('smtp');
logProviderSummary(logger, env);

const server = createSmtpServer(logger);
server.on('error', (err) => logger.error({ err }, 'smtp server error'));

onShutdown(logger, async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeQueues();
  await db.$disconnect();
  redis.disconnect();
});

server.listen(env.SMTP_PORT, '0.0.0.0', () => {
  logger.info({ port: env.SMTP_PORT, domain: env.MAIL_DOMAIN }, 'smtp listening');
});
