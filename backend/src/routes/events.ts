import { Router } from 'express';
import type { EventRepository } from '../repositories/eventRepository.js';
import type { Broadcaster } from '../types/event.js';
import { createEventSchema, parseOrThrow } from '../utils/validation.js';

export interface EventsRouterDeps {
  repo: EventRepository;
  broadcaster: Broadcaster;
}

export function createEventsRouter({ repo, broadcaster }: EventsRouterDeps): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const input = parseOrThrow(createEventSchema, req.body);
    const event = await repo.create(input);
    broadcaster.broadcast({ type: 'event.created', event });
    res.status(201).json(event);
  });

  return router;
}
