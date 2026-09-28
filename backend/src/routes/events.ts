import { Router } from 'express';
import type { EventRepository } from '../repositories/eventRepository.js';
import type { Broadcaster, EventFilters } from '../types/event.js';
import { createEventSchema, listEventsQuerySchema, parseOrThrow } from '../utils/validation.js';

export interface EventsRouterDeps {
  repo: EventRepository;
  broadcaster: Broadcaster;
}

export function createEventsRouter({ repo, broadcaster }: EventsRouterDeps): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const filters: EventFilters = parseOrThrow(listEventsQuerySchema, req.query);
    const { data, pagination } = await repo.list(filters);
    res.status(200).json({ data, pagination });
  });

  router.post('/', async (req, res) => {
    const input = parseOrThrow(createEventSchema, req.body);
    const event = await repo.create(input);
    broadcaster.broadcast({ type: 'event.created', event });
    res.status(201).json(event);
  });

  return router;
}
