import type { Analytics, Event, EventFilters, PaginatedResult } from '../types/event.js';

export interface EventRepository {
  create(event: Event): Promise<Event>;
  list(filters: EventFilters): Promise<PaginatedResult<Event>>;
  analytics(windowHours: number, eventTypes?: string[]): Promise<Analytics>;
  ping(): Promise<void>;
}
