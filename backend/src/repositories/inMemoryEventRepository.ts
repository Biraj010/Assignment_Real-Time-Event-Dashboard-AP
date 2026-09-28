import { ConflictError } from '../errors/index.js';
import type {
  Analytics,
  Event,
  EventFilters,
  EventTypeCount,
  HourlyCount,
  PaginatedResult,
} from '../types/event.js';
import { buildPagination, getOffset } from '../utils/pagination.js';
import type { EventRepository } from './eventRepository.js';

const HOUR_MS = 3_600_000;

function cloneEvent(event: Event): Event {
  return {
    id: event.id,
    user_id: event.user_id,
    event_type: event.event_type,
    payload: structuredClone(event.payload),
    timestamp: event.timestamp,
  };
}

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function compareNewestFirst(a: Event, b: Event): number {
  return Date.parse(b.timestamp) - Date.parse(a.timestamp) || compareText(b.id, a.id);
}

function toUtcHour(time: number): string {
  return new Date(Math.floor(time / HOUR_MS) * HOUR_MS).toISOString();
}

export class InMemoryEventRepository implements EventRepository {
  private readonly events = new Map<string, Event>();
  private failure: { error: unknown } | null = null;

  get size(): number {
    return this.events.size;
  }

  failWith(error: unknown): void {
    this.failure = error === null ? null : { error };
  }

  clear(): void {
    this.events.clear();
  }

  async create(event: Event): Promise<Event> {
    this.throwIfFailing();

    if (this.events.has(event.id)) {
      throw new ConflictError(`Event with id "${event.id}" already exists`);
    }

    const stored = cloneEvent({ ...event, timestamp: new Date(event.timestamp).toISOString() });
    this.events.set(stored.id, stored);
    return cloneEvent(stored);
  }

  async list(filters: EventFilters): Promise<PaginatedResult<Event>> {
    this.throwIfFailing();

    const eventTypes =
      filters.eventTypes && filters.eventTypes.length > 0 ? new Set(filters.eventTypes) : null;
    const from = filters.from?.getTime();
    const to = filters.to?.getTime();
    const needle = filters.q?.toLowerCase();

    const matches = [...this.events.values()]
      .filter((event) => {
        const time = Date.parse(event.timestamp);
        return (
          (eventTypes === null || eventTypes.has(event.event_type)) &&
          (from === undefined || time >= from) &&
          (to === undefined || time <= to) &&
          (needle === undefined || JSON.stringify(event.payload).toLowerCase().includes(needle))
        );
      })
      .sort(compareNewestFirst);

    const offset = getOffset(filters.page, filters.limit);

    return {
      data: matches.slice(offset, offset + filters.limit).map(cloneEvent),
      pagination: buildPagination(filters.page, filters.limit, matches.length),
    };
  }

  async analytics(windowHours: number, eventTypes?: string[]): Promise<Analytics> {
    this.throwIfFailing();

    const now = Date.now();
    const windowStart = now - windowHours * HOUR_MS;
    const allowedTypes = eventTypes && eventTypes.length > 0 ? new Set(eventTypes) : null;
    const typeCounts = new Map<string, number>();
    const hourCounts = new Map<string, number>();

    for (const event of this.events.values()) {
      const time = Date.parse(event.timestamp);
      if (time < windowStart || time > now) continue;
      if (allowedTypes && !allowedTypes.has(event.event_type)) continue;

      typeCounts.set(event.event_type, (typeCounts.get(event.event_type) ?? 0) + 1);
      const hour = toUtcHour(time);
      hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
    }

    const byType: EventTypeCount[] = [...typeCounts]
      .map(([event_type, count]) => ({ event_type, count }))
      .sort((a, b) => b.count - a.count || compareText(a.event_type, b.event_type));

    const hourly: HourlyCount[] = [...hourCounts]
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => compareText(a.hour, b.hour));

    return {
      windowHours,
      total: byType.reduce((sum, entry) => sum + entry.count, 0),
      byType,
      hourly,
    };
  }

  async ping(): Promise<void> {
    this.throwIfFailing();
  }

  private throwIfFailing(): void {
    if (this.failure) {
      throw this.failure.error;
    }
  }
}
