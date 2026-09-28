import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/errors/index.js';
import {
  analyticsQuerySchema,
  createEventSchema,
  listEventsQuerySchema,
  parseOrThrow,
  type ValidationIssue,
} from '../../src/utils/validation.js';

const validBody = {
  id: 'evt_1',
  user_id: 'user_1',
  event_type: 'page.view',
  payload: { path: '/home' },
  timestamp: '2026-09-28T08:00:00Z',
};

function issuesFor(schema: Parameters<typeof parseOrThrow>[0], input: unknown): ValidationIssue[] {
  try {
    parseOrThrow(schema, input);
  } catch (err) {
    expect(err).toBeInstanceOf(ValidationError);
    const validationError = err as ValidationError;
    expect(validationError.statusCode).toBe(400);
    expect(validationError.code).toBe('VALIDATION_ERROR');
    return validationError.details as ValidationIssue[];
  }
  throw new Error('Expected parseOrThrow to throw a ValidationError');
}

const paths = (issues: ValidationIssue[]): string[] => issues.map((issue) => issue.path);

describe('createEventSchema', () => {
  it('accepts a valid body', () => {
    expect(parseOrThrow(createEventSchema, validBody)).toEqual(validBody);
  });

  it('accepts a timestamp with a non-UTC offset and keeps it as-is', () => {
    const body = { ...validBody, timestamp: '2026-09-28T13:45:00.123+05:45' };
    expect(parseOrThrow(createEventSchema, body).timestamp).toBe('2026-09-28T13:45:00.123+05:45');
  });

  it('defaults payload to an empty object', () => {
    const { payload: _payload, ...withoutPayload } = validBody;
    expect(parseOrThrow(createEventSchema, withoutPayload).payload).toEqual({});
  });

  it('accepts nested payloads', () => {
    const payload = { cart: { items: [{ sku: 'a', qty: 2 }] }, total: 12.5 };
    expect(parseOrThrow(createEventSchema, { ...validBody, payload }).payload).toEqual(payload);
  });

  it('reports every missing required field', () => {
    const issues = issuesFor(createEventSchema, {});
    expect(paths(issues)).toEqual(['id', 'user_id', 'event_type', 'timestamp']);
    expect(issues.find((issue) => issue.path === 'timestamp')?.message).toBe('is required');
  });

  it('rejects blank and overlong identifiers', () => {
    const issues = issuesFor(createEventSchema, { ...validBody, id: '   ', user_id: 'x'.repeat(129) });
    expect(issues).toEqual([
      { path: 'id', message: 'must not be empty' },
      expect.objectContaining({ path: 'user_id' }),
    ]);
  });

  it.each([
    ['not a date', 'yesterday'],
    ['missing offset', '2026-09-28T08:00:00'],
    ['date only', '2026-09-28'],
    ['a number', 1_790_000_000_000],
  ])('rejects a bad timestamp (%s)', (_label, timestamp) => {
    const issues = issuesFor(createEventSchema, { ...validBody, timestamp });
    expect(paths(issues)).toEqual(['timestamp']);
  });

  it.each([
    ['an array', [1, 2, 3]],
    ['null', null],
    ['a string', 'payload'],
    ['a number', 42],
  ])('rejects %s as payload', (_label, payload) => {
    const issues = issuesFor(createEventSchema, { ...validBody, payload });
    expect(issues).toEqual([{ path: 'payload', message: 'must be a JSON object' }]);
  });

  it('rejects unknown keys, one issue per key', () => {
    const issues = issuesFor(createEventSchema, { ...validBody, extra: true, source: 'web' });
    expect(issues).toEqual([
      { path: 'extra', message: 'is not an allowed field' },
      { path: 'source', message: 'is not an allowed field' },
    ]);
  });

  it.each(['Page View', 'PAGE', 'page view', 'page/view', 'événement', ''])(
    'rejects event_type %j that violates the pattern',
    (eventType) => {
      const issues = issuesFor(createEventSchema, { ...validBody, event_type: eventType });
      expect(paths(issues)).toEqual(['event_type']);
    },
  );

  it.each(['click', 'page.view', 'user_signed-up', 'v2.checkout'])('accepts event_type %j', (eventType) => {
    expect(parseOrThrow(createEventSchema, { ...validBody, event_type: eventType }).event_type).toBe(eventType);
  });

  it('rejects an event_type longer than 64 characters', () => {
    expect(paths(issuesFor(createEventSchema, { ...validBody, event_type: 'a'.repeat(65) }))).toEqual([
      'event_type',
    ]);
  });

  it('rejects a non-object body', () => {
    expect(paths(issuesFor(createEventSchema, 'nope'))).toEqual(['']);
  });
});

describe('listEventsQuerySchema', () => {
  it('applies defaults to an empty query', () => {
    expect(parseOrThrow(listEventsQuerySchema, {})).toEqual({ page: 1, limit: 20 });
  });

  it('treats empty strings as missing', () => {
    expect(
      parseOrThrow(listEventsQuerySchema, { page: '', limit: '', event_type: '', from: '', q: '   ' }),
    ).toEqual({ page: 1, limit: 20 });
  });

  it('coerces page and limit from strings', () => {
    expect(parseOrThrow(listEventsQuerySchema, { page: '3', limit: '50' })).toEqual({ page: 3, limit: 50 });
  });

  it.each([
    ['page 0', { page: '0' }, 'page'],
    ['negative page', { page: '-1' }, 'page'],
    ['fractional page', { page: '1.5' }, 'page'],
    ['non-numeric page', { page: 'abc' }, 'page'],
    ['limit 0', { limit: '0' }, 'limit'],
    ['limit 101', { limit: '101' }, 'limit'],
  ])('rejects %s', (_label, query, path) => {
    expect(paths(issuesFor(listEventsQuerySchema, query))).toEqual([path]);
  });

  it.each(['1', '100'])('accepts limit at the bound %s', (limit) => {
    expect(parseOrThrow(listEventsQuerySchema, { limit }).limit).toBe(Number(limit));
  });

  it('splits a comma-separated event_type list, trimming, dropping blanks and duplicates', () => {
    expect(parseOrThrow(listEventsQuerySchema, { event_type: ' click, page.view,,click ' }).eventTypes).toEqual([
      'click',
      'page.view',
    ]);
  });

  it('merges repeated event_type parameters', () => {
    expect(parseOrThrow(listEventsQuerySchema, { event_type: ['a,b', 'c'] }).eventTypes).toEqual(['a', 'b', 'c']);
  });

  it('reports the index of an invalid event_type in the list', () => {
    expect(paths(issuesFor(listEventsQuerySchema, { event_type: 'ok,Bad Type' }))).toEqual(['event_type.1']);
  });

  it('parses from/to as dates (date-only means UTC midnight)', () => {
    const filters = parseOrThrow(listEventsQuerySchema, {
      from: '2026-09-01',
      to: '2026-09-28T23:59:59+05:45',
    });
    expect(filters.from?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(filters.to?.toISOString()).toBe('2026-09-28T18:14:59.000Z');
  });

  it('accepts from equal to to', () => {
    const filters = parseOrThrow(listEventsQuerySchema, { from: '2026-09-01', to: '2026-09-01' });
    expect(filters.from?.getTime()).toBe(filters.to?.getTime());
  });

  it('rejects from later than to, reporting it on from', () => {
    expect(issuesFor(listEventsQuerySchema, { from: '2026-09-28', to: '2026-09-01' })).toEqual([
      { path: 'from', message: 'must be earlier than or equal to "to"' },
    ]);
  });

  it('rejects an unparseable date', () => {
    expect(paths(issuesFor(listEventsQuerySchema, { from: 'last tuesday' }))).toEqual(['from']);
  });

  it('trims q and rejects q over 200 characters', () => {
    expect(parseOrThrow(listEventsQuerySchema, { q: '  hello  ' }).q).toBe('hello');
    expect(paths(issuesFor(listEventsQuerySchema, { q: 'x'.repeat(201) }))).toEqual(['q']);
  });

  it('omits unset optional filters from the result', () => {
    const filters = parseOrThrow(listEventsQuerySchema, { page: '2' });
    expect(Object.keys(filters).sort()).toEqual(['limit', 'page']);
  });
});

describe('analyticsQuerySchema', () => {
  it('defaults hours to 24', () => {
    expect(parseOrThrow(analyticsQuerySchema, {})).toEqual({ hours: 24 });
  });

  it('parses event_type the same way as the list query', () => {
    expect(parseOrThrow(analyticsQuerySchema, { hours: '24', event_type: 'click,login' })).toEqual({
      hours: 24,
      eventTypes: ['click', 'login'],
    });
  });

  it.each(['1', '720'])('accepts hours at the bound %s', (hours) => {
    expect(parseOrThrow(analyticsQuerySchema, { hours })).toEqual({ hours: Number(hours) });
  });

  it.each(['0', '721', '1.5', 'abc'])('rejects hours=%s', (hours) => {
    expect(paths(issuesFor(analyticsQuerySchema, { hours }))).toEqual(['hours']);
  });
});
