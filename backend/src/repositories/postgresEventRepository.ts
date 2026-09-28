import type { QueryResult, QueryResultRow } from 'pg';
import {
  AppError,
  ConflictError,
  DatabaseError,
  isPgConnectionError,
  isPgUniqueViolation,
} from '../errors/index.js';
import type {
  Analytics,
  Event,
  EventFilters,
  EventTypeCount,
  HourlyCount,
  PaginatedResult,
} from '../types/event.js';
import { buildPagination } from '../utils/pagination.js';
import { buildListQuery } from '../utils/queryBuilder.js';
import type { EventRepository } from './eventRepository.js';

export interface SqlClient {
  query<R extends QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
}

interface EventRow {
  id: string;
  user_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  timestamp: Date;
}

interface CountRow {
  total: number;
}

interface TypeCountRow {
  event_type: string;
  count: number;
}

interface HourlyRow {
  hour: Date;
  count: number;
}

const INSERT_EVENT_SQL = `
  INSERT INTO events (id, user_id, event_type, payload, timestamp)
  VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz)
  RETURNING id, user_id, event_type, payload, timestamp`;

const WINDOW_CONDITION =
  'timestamp >= now() - make_interval(hours => $1::int) AND timestamp <= now()';

const COUNT_BY_TYPE_SQL = `
  SELECT event_type, COUNT(*)::int AS count
  FROM events
  WHERE ${WINDOW_CONDITION}
  GROUP BY event_type
  ORDER BY count DESC, event_type ASC`;

const COUNT_BY_HOUR_SQL = `
  SELECT date_trunc('hour', timestamp AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS hour,
         COUNT(*)::int AS count
  FROM events
  WHERE ${WINDOW_CONDITION}
  GROUP BY 1
  ORDER BY 1 ASC`;

function toEvent(row: EventRow): Event {
  return {
    id: row.id,
    user_id: row.user_id,
    event_type: row.event_type,
    payload: row.payload,
    timestamp: row.timestamp.toISOString(),
  };
}

function translateError(err: unknown, conflictMessage?: string): unknown {
  if (err instanceof AppError) {
    return err;
  }
  if (conflictMessage !== undefined && isPgUniqueViolation(err)) {
    return new ConflictError(conflictMessage, undefined, { cause: err });
  }
  if (isPgConnectionError(err)) {
    return new DatabaseError(undefined, undefined, { cause: err });
  }
  return err;
}

export class PostgresEventRepository implements EventRepository {
  constructor(private readonly db: SqlClient) {}

  async create(event: Event): Promise<Event> {
    try {
      const result = await this.db.query<EventRow>(INSERT_EVENT_SQL, [
        event.id,
        event.user_id,
        event.event_type,
        JSON.stringify(event.payload),
        event.timestamp,
      ]);
      const row = result.rows[0];
      if (!row) {
        throw new Error('INSERT ... RETURNING returned no rows');
      }
      return toEvent(row);
    } catch (err) {
      throw translateError(err, `Event with id "${event.id}" already exists`);
    }
  }

  async list(filters: EventFilters): Promise<PaginatedResult<Event>> {
    const query = buildListQuery(filters);
    try {
      const [countResult, dataResult] = await Promise.all([
        this.db.query<CountRow>(query.countText, query.countParams),
        this.db.query<EventRow>(query.text, query.params),
      ]);
      const total = countResult.rows[0]?.total ?? 0;
      return {
        data: dataResult.rows.map(toEvent),
        pagination: buildPagination(filters.page, filters.limit, total),
      };
    } catch (err) {
      throw translateError(err);
    }
  }

  async analytics(windowHours: number): Promise<Analytics> {
    try {
      const [typeResult, hourlyResult] = await Promise.all([
        this.db.query<TypeCountRow>(COUNT_BY_TYPE_SQL, [windowHours]),
        this.db.query<HourlyRow>(COUNT_BY_HOUR_SQL, [windowHours]),
      ]);
      const byType: EventTypeCount[] = typeResult.rows.map((row) => ({
        event_type: row.event_type,
        count: row.count,
      }));
      const hourly: HourlyCount[] = hourlyResult.rows.map((row) => ({
        hour: row.hour.toISOString(),
        count: row.count,
      }));
      return {
        windowHours,
        total: byType.reduce((sum, entry) => sum + entry.count, 0),
        byType,
        hourly,
      };
    } catch (err) {
      throw translateError(err);
    }
  }

  async ping(): Promise<void> {
    try {
      await this.db.query('SELECT 1');
    } catch (err) {
      throw new DatabaseError(undefined, undefined, { cause: err });
    }
  }
}
