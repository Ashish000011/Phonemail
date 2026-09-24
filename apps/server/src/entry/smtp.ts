import { SMTPServer } from 'smtp-server';
import { env } from '../config/env.js';
import { logProviderSummary } from '../config/providers.js';
import { createLogger } from '../lib/logger.js';
import { onShutdown } from './shutdown.js';

// The SMTP server for @MAIL_DOMAIN. Phase 0 is a stub that accepts
// connections and politely defers mail; the real engine arrives in Phase 2.
const logger = createLogger('smtp');
logProviderSummary(logger, env);

const server = new SMTPServer({
  name: env.MAIL_DOMAIN,
  banner: 'PhoneMail',
  authOptional: true,
  disabledCommands: ['STARTTLS', 'AUTH'],
  logger: false,
  onConnect(session, callback) {
    logger.debug({ remoteAddress: session.remoteAddress }, 'smtp connection');
    callback();
  },
  onRcptTo(_address, _session, callback) {
    // 451 = temporary failure, so a real sender would retry later.
    const error = Object.assign(new Error('Mail engine not ready yet, try again later'), {
      responseCode: 451,
    });
    callback(error);
  },
});

server.on('error', (err) => logger.error({ err }, 'smtp server error'));

onShutdown(logger, () => new Promise<void>((resolve) => server.close(() => resolve())));

server.listen(env.SMTP_PORT, '0.0.0.0', () => {
  logger.info({ port: env.SMTP_PORT }, 'smtp listening');
});
