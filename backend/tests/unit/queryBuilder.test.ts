import { describe, expect, it } from 'vitest';
import type { EventFilters } from '../../src/types/event.js';
import {
  buildAnalyticsQuery,
  buildEventFilterClause,
  buildListQuery,
  escapeLikePattern,
} from '../../src/utils/queryBuilder.js';

const from = new Date('2026-09-01T00:00:00.000Z');
const to = new Date('2026-09-28T23:59:59.000Z');

const allFilters: EventFilters = {
  page: 3,
  limit: 10,
  eventTypes: ['click', 'purchase'],
  from,
  to,
  q: 'checkout',
};

function placeholders(sql: string): number[] {
  return [...sql.matchAll(/\$(\d+)/g)].map((match) => Number(match[1]));
}

describe('escapeLikePattern', () => {
  it.each([
    ['plain', 'plain'],
    ['50%', '50\\%'],
    ['under_score', 'under\\_score'],
    ['back\\slash', 'back\\\\slash'],
    ['%_\\', '\\%\\_\\\\'],
    ['a\\%b', 'a\\\\\\%b'],
  ])('escapes %j as %j', (input, expected) => {
    expect(escapeLikePattern(input)).toBe(expected);
  });
});

describe('buildEventFilterClause', () => {
  it('returns an empty clause with no filters', () => {
    expect(buildEventFilterClause({ page: 1, limit: 20 })).toEqual({ where: '', params: [] });
  });

  it('ignores an empty eventTypes list', () => {
    expect(buildEventFilterClause({ page: 1, limit: 20, eventTypes: [] })).toEqual({ where: '', params: [] });
  });

  it('builds every condition in a fixed order with sequential placeholders', () => {
    const { where, params } = buildEventFilterClause(allFilters);

    expect(where).toBe(
      'WHERE event_type IN ($1, $2) AND timestamp >= $3 AND timestamp <= $4 AND payload::text ILIKE $5',
    );
    expect(params).toEqual(['click', 'purchase', from, to, '%checkout%']);
  });

  it('numbers placeholders from $1 for whichever filters are present', () => {
    const { where, params } = buildEventFilterClause({ page: 1, limit: 20, to, q: 'x' });

    expect(where).toBe('WHERE timestamp <= $1 AND payload::text ILIKE $2');
    expect(params).toEqual([to, '%x%']);
  });

  it('escapes LIKE wildcards in q and wraps it in %', () => {
    const { params } = buildEventFilterClause({ page: 1, limit: 20, q: '50%_off\\' });
    expect(params).toEqual(['%50\\%\\_off\\\\%']);
  });

  it('never puts user input into the SQL text', () => {
    const hostile = "'; DROP TABLE events; --";
    const { where, params } = buildEventFilterClause({
      page: 1,
      limit: 20,
      eventTypes: [hostile],
      q: hostile,
    });

    expect(where).not.toContain('DROP');
    expect(where).not.toContain("'");
    expect(params).toEqual([hostile, `%${hostile}%`]);
  });

  it('copies eventTypes so later mutation does not change params', () => {
    const eventTypes = ['click'];
    const { params } = buildEventFilterClause({ page: 1, limit: 20, eventTypes });
    eventTypes.push('mutated');
    expect(params).toEqual(['click']);
  });
});

describe('buildListQuery', () => {
  it('builds unfiltered data and count queries', () => {
    const query = buildListQuery({ page: 1, limit: 20 });

    expect(query.text).toBe(
      'SELECT id, user_id, event_type, payload, timestamp FROM events ' +
        'ORDER BY timestamp DESC, id DESC LIMIT $1 OFFSET $2',
    );
    expect(query.countText).toBe('SELECT COUNT(*)::int AS total FROM events');
    expect(query.params).toEqual([20, 0]);
    expect(query.countParams).toEqual([]);
  });

  it('appends LIMIT and OFFSET after the filter params', () => {
    const query = buildListQuery(allFilters);

    expect(query.text).toBe(
      'SELECT id, user_id, event_type, payload, timestamp FROM events ' +
        'WHERE event_type IN ($1, $2) AND timestamp >= $3 AND timestamp <= $4 AND payload::text ILIKE $5 ' +
        'ORDER BY timestamp DESC, id DESC LIMIT $6 OFFSET $7',
    );
    expect(query.params).toEqual(['click', 'purchase', from, to, '%checkout%', 10, 20]);
  });

  it('shares the WHERE clause with the count query, without LIMIT/OFFSET params', () => {
    const query = buildListQuery(allFilters);

    expect(query.countText).toBe(
      'SELECT COUNT(*)::int AS total FROM events ' +
        'WHERE event_type IN ($1, $2) AND timestamp >= $3 AND timestamp <= $4 AND payload::text ILIKE $5',
    );
    expect(query.countParams).toEqual(['click', 'purchase', from, to, '%checkout%']);
  });

  it.each<[string, EventFilters]>([
    ['no filters', { page: 1, limit: 20 }],
    ['one filter', { page: 2, limit: 5, q: 'x' }],
    ['all filters', allFilters],
  ])('uses exactly $1..$n matching the params (%s)', (_label, filters) => {
    const query = buildListQuery(filters);
    const used = placeholders(query.text);

    expect(used).toEqual(Array.from({ length: query.params.length }, (_, index) => index + 1));
    expect(placeholders(query.countText)).toEqual(used.slice(0, query.countParams.length));
  });

  it('keeps the count params independent from the data params', () => {
    const query = buildListQuery({ page: 1, limit: 20, q: 'x' });
    query.countParams.push('mutated');
    expect(query.params).toEqual(['%x%', 20, 0]);
  });
});

describe('buildAnalyticsQuery', () => {
  it('scopes counts to the hour window', () => {
    const query = buildAnalyticsQuery(24);
    expect(query.params).toEqual([24]);
    expect(query.byTypeText).toContain('make_interval(hours => $1::int)');
    expect(query.hourlyText).toContain('make_interval(hours => $1::int)');
    expect(query.byTypeText).not.toContain('event_type IN');
  });

  it('adds event_type placeholders after hours', () => {
    const query = buildAnalyticsQuery(7, ['click', 'login']);
    expect(query.params).toEqual([7, 'click', 'login']);
    expect(query.byTypeText).toContain('event_type IN ($2, $3)');
    expect(query.hourlyText).toContain('event_type IN ($2, $3)');
  });
});
