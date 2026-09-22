import { PrismaClient } from '@prisma/client';
import { createApp } from './app.js';
import { config } from './config.js';
import { log } from './middleware/observability.js';

const prisma = new PrismaClient();
const app = createApp(undefined, undefined, prisma);
const server = app.listen(config.PORT, () => {
  log.info('server_started', { port: config.PORT, environment: config.NODE_ENV });
});

let shuttingDown = false;
const shutdown = async (signal: string, exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info('server_shutdown_started', { signal });

  const forceTimer = setTimeout(() => {
    log.error('server_shutdown_timeout', { signal });
    process.exit(1);
  }, config.SHUTDOWN_TIMEOUT_MS);
  forceTimer.unref();
  server.close(async (closeError) => {
    try {
      await prisma.$disconnect();
      if (closeError) throw closeError;
      clearTimeout(forceTimer);
      log.info('server_shutdown_complete', { signal });
      process.exit(exitCode);
    } catch (error) {
      log.error('server_shutdown_failed', {
        signal,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      process.exit(1);
    }
  });
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  log.error('unhandled_rejection', { message: reason instanceof Error ? reason.message : String(reason) });
  void shutdown('unhandledRejection', 1);
});
