import { Router } from 'express';
import type { EventRepository } from '../repositories/eventRepository.js';

export interface HealthRouterDeps {
  repo: EventRepository;
}

export function createHealthRouter({ repo }: HealthRouterDeps): Router {
  const router = Router();

  router.get('/health', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      await repo.ping();
      res.status(200).json({
        status: 'ok',
        db: 'up',
        uptime: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      });
    } catch {
      res.status(503).json({
        status: 'degraded',
        db: 'down',
        timestamp: new Date().toISOString(),
      });
    }
  });

  return router;
}
