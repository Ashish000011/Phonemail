import type { Logger } from '../lib/logger.js';

/**
 * Runs the cleanup steps once on SIGTERM/SIGINT (docker compose stop, Ctrl+C),
 * so open connections close and in-flight work finishes.
 */
export function onShutdown(logger: Logger, cleanup: () => Promise<void>) {
  let shuttingDown = false;
  const handler = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    try {
      await cleanup();
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void handler('SIGTERM'));
  process.on('SIGINT', () => void handler('SIGINT'));
}
