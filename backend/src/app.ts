import express, {
  type ErrorRequestHandler,
  type Express,
  type RequestHandler,
} from 'express';
import { AppError } from './errors/index.js';
import type { EventRepository } from './repositories/eventRepository.js';

export interface AppDependencies {
  repo: EventRepository;
}

export function createApp({ repo }: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', async (_req, res) => {
    try {
      await repo.ping();
      res.status(200).json({ status: 'ok', db: 'up', uptime: process.uptime() });
    } catch {
      res.status(503).json({ status: 'degraded', db: 'down' });
    }
  });

  const notFoundHandler: RequestHandler = (_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  };

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  };

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
