import type { EventFilters } from '../types/event.js';
import { getOffset } from './pagination.js';

export type QueryParam = string | number | Date | string[];

export interface FilterClause {
  where: string;
  params: QueryParam[];
}

export interface ListQuery {
  text: string;
  countText: string;
  params: QueryParam[];
  countParams: QueryParam[];
}

const EVENT_COLUMNS = 'id, user_id, event_type, payload, timestamp';

export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function buildEventFilterClause(filters: EventFilters): FilterClause {
  const conditions: string[] = [];
  const params: QueryParam[] = [];

  const addParam = (value: QueryParam): string => {
    params.push(value);
    return `$${params.length}`;
  };

  if (filters.eventTypes && filters.eventTypes.length > 0) {
    conditions.push(`event_type = ANY(${addParam([...filters.eventTypes])}::text[])`);
  }
  if (filters.from) {
    conditions.push(`timestamp >= ${addParam(filters.from)}`);
  }
  if (filters.to) {
    conditions.push(`timestamp <= ${addParam(filters.to)}`);
  }
  if (filters.q) {
    conditions.push(`payload::text ILIKE ${addParam(`%${escapeLikePattern(filters.q)}%`)}`);
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

export function buildListQuery(filters: EventFilters): ListQuery {
  const { where, params } = buildEventFilterClause(filters);
  const limitPlaceholder = `$${params.length + 1}`;
  const offsetPlaceholder = `$${params.length + 2}`;
  const whereSql = where ? ` ${where}` : '';

  return {
    text:
      `SELECT ${EVENT_COLUMNS} FROM events${whereSql}` +
      ` ORDER BY timestamp DESC, id DESC LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
    countText: `SELECT COUNT(*)::int AS total FROM events${whereSql}`,
    params: [...params, filters.limit, getOffset(filters.page, filters.limit)],
    countParams: [...params],
  };
}
