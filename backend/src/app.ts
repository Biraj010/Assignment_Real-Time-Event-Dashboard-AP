import express, { type Express } from 'express';
import type { NodeEnv } from './config/env.js';
import { logger as defaultLogger, type Logger } from './lib/logger.js';
import { createErrorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createRequestLogger } from './middleware/requestLogger.js';
import type { EventRepository } from './repositories/eventRepository.js';

export interface AppDependencies {
  repo: EventRepository;
  logger?: Logger;
  env?: NodeEnv;
}

export function createApp({
  repo,
  logger = defaultLogger,
  env = 'production',
}: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(createRequestLogger(logger));
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', async (_req, res) => {
    try {
      await repo.ping();
      res.status(200).json({ status: 'ok', db: 'up', uptime: process.uptime() });
    } catch {
      res.status(503).json({ status: 'degraded', db: 'down' });
    }
  });

  app.use(notFoundHandler);
  app.use(createErrorHandler({ logger, env }));

  return app;
}
