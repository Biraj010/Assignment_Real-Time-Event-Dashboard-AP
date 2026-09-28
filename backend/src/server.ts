import http from 'node:http';
import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { connectWithRetry, createPool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { createLogger, logger as fallbackLogger, type Logger } from './lib/logger.js';
import { PostgresEventRepository } from './repositories/postgresEventRepository.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

let activeLogger: Logger = fallbackLogger;

process.on('unhandledRejection', (reason) => {
  activeLogger.fatal({ err: reason }, 'Unhandled promise rejection');
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  activeLogger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});

function listen(server: http.Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error): void => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = (): void => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port);
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
    server.closeIdleConnections();
  });
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel, config.env);
  activeLogger = logger;

  const pool = createPool(config.databaseUrl, logger);
  await connectWithRetry(pool, { logger });
  await runMigrations(pool, logger);

  const repo = new PostgresEventRepository(pool);

  const httpServer = http.createServer();
  const app = createApp({ repo, config, logger });
  httpServer.on('request', app);

  await listen(httpServer, config.port);
  logger.info(`API listening on http://localhost:${config.port}`);

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, 'Shutdown signal received; closing HTTP server');

    const forceExit = setTimeout(() => {
      logger.fatal({ timeoutMs: SHUTDOWN_TIMEOUT_MS }, 'Graceful shutdown timed out; forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    try {
      await closeServer(httpServer);
      logger.info('HTTP server closed; closing database pool');
      await pool.end();
      logger.info('Database pool closed; exiting');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.once('SIGINT', (signal) => void shutdown(signal));
  process.once('SIGTERM', (signal) => void shutdown(signal));
}

main().catch((err: unknown) => {
  activeLogger.fatal({ err }, 'Failed to start API');
  process.exit(1);
});
