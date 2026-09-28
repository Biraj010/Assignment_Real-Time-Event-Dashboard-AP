import cors from 'cors';
import express, { Router, type Express } from 'express';
import helmet from 'helmet';
import type { AppConfig } from './config/env.js';
import type { Logger } from './lib/logger.js';
import { createErrorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createRateLimiter } from './middleware/rateLimiter.js';
import { createRequestLogger } from './middleware/requestLogger.js';
import type { EventRepository } from './repositories/eventRepository.js';
import { createEventsRouter } from './routes/events.js';
import { createHealthRouter } from './routes/health.js';
import type { Broadcaster } from './types/event.js';

export interface AppDeps {
  repo: EventRepository;
  config: AppConfig;
  logger: Logger;
  broadcaster?: Broadcaster;
}

export const noopBroadcaster: Broadcaster = {
  broadcast: () => undefined,
};

export function createApp(deps: AppDeps): Express {
  const { repo, config, logger } = deps;
  const broadcaster = deps.broadcaster ?? noopBroadcaster;
  const app = express();

  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins === '*' ? '*' : config.corsOrigins }));
  app.use(express.json({ limit: '100kb' }));
  app.use(createRequestLogger(logger));

  app.use(createHealthRouter({ repo }));

  const api = Router();
  api.use('/events', createEventsRouter({ repo, broadcaster }));
  app.use('/api', createRateLimiter(config.rateLimit), api);

  app.use(notFoundHandler);
  app.use(createErrorHandler({ logger, env: config.env }));

  return app;
}
